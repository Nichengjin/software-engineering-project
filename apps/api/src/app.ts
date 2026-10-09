import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import * as contracts from '@wylie/contracts';
import { Prisma } from '@prisma/client';
import { Runtime, type Dependencies, type Actor } from './runtime/context.js';
import { ApiError, requireRules, stale } from './errors.js';
import { authenticate, authRoutes, parseBody, success, type Env } from './auth/session.js';
import { CatalogService } from './modules/catalog/service.js';
import { ScheduleService } from './modules/schedules/service.js';
import { TeachingService } from './modules/teaching/service.js';
import { BillingService, billingView } from './modules/billing/service.js';
import { CloseService } from './modules/terms/close.js';
import { PeopleService, personView, type Kind } from './modules/people/service.js';
import { ImportService } from './modules/imports/service.js';
import { emptyChoices, validWindows } from './rules.js';
import type { Snapshot } from './runtime/external.js';

const actor = (c: Context<Env>): Actor => ({ accountId: c.get('account').id, requestId: c.get('requestId') });
const param = (c: Context<Env>, name: string, uuid = true): string => {
  const value = c.req.param(name); const result = (uuid ? z.string().uuid() : contracts.idSchema).safeParse(value);
  if (!result.success) throw new ApiError(400, 'INVALID_INPUT', '标识格式无效'); return result.data;
};
const kind = (c: Context<Env>): Kind => {
  const value = c.req.param('kind'); if (value !== 'students' && value !== 'professors') throw new ApiError(404, 'NOT_FOUND', '人员类别不存在'); return value;
};
function query<S extends z.ZodTypeAny>(c: Context<Env>, schema: S): z.output<S> {
  const result = schema.safeParse(c.req.query()); if (!result.success) throw new ApiError(400, 'INVALID_INPUT', '查询参数无效'); return result.data;
}

export function createApplication(deps: Dependencies) {
  const runtime = new Runtime(deps); const catalog = new CatalogService(runtime); const schedules = new ScheduleService(runtime, catalog);
  const teaching = new TeachingService(runtime, catalog); const billing = new BillingService(runtime); const close = new CloseService(runtime, catalog, schedules, billing);
  const people = new PeopleService(runtime, schedules); const imports = new ImportService(runtime, people); const app = new Hono<Env>();
  app.use('/api/*', async (c, next) => {
    c.set('requestId', randomUUID()); c.header('X-Request-ID', c.get('requestId')); c.header('Cache-Control', 'no-store');
    const started = performance.now();
    await next();
    runtime.log({ requestId: c.get('requestId'), route: c.req.routePath, status: c.res.status, durationMs: Math.round(performance.now() - started), actorAccountId: c.get('account')?.id });
  });
  app.onError(async (error, c) => {
    const databaseError = error instanceof Prisma.PrismaClientInitializationError || error instanceof Prisma.PrismaClientKnownRequestError && ['P1000','P1001','P1002','P1008','P1017'].includes(error.code);
    const e = error instanceof ApiError ? error : new ApiError(databaseError ? 503 : 500, databaseError ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR', databaseError ? '数据库暂不可用' : '内部错误，请凭请求编号联系教务员');
    const account = c.get('account');
    await runtime.failAudit(account ? actor(c) : null, `${c.req.method} ${c.req.routePath}`, c.req.path, e.code);
    c.header('X-Request-ID', c.get('requestId')); c.header('Cache-Control', 'no-store');
    return c.json({ error: { code: e.code, message: e.message, issues: e.issues, ...(e.currentVersion !== undefined ? { currentVersion: e.currentVersion } : {}), retryable: e.status >= 500 }, requestId: c.get('requestId') }, e.status as 400);
  });
  app.use('/api/*', async (c, next) => bodyLimit({ maxSize: c.req.path.startsWith('/api/registrar/imports/') ? 6 * 1024 * 1024 : 1024 * 1024, onError: () => { throw new ApiError(413, 'FILE_TOO_LARGE', '请求内容过大'); } })(c, next));
  app.use('/api/*', authenticate(runtime));
  app.get('/api/health/live', c => c.json({ data: { status: 'ok' }, requestId: c.get('requestId'), serverTime: new Date().toISOString() }));
  app.get('/api/health/ready', async c => {
    if (!runtime.ready) throw new ApiError(503, 'RECOVERING', '系统尚未就绪');
    await runtime.db.$queryRaw`SELECT 1`; return success(c, runtime, { status: 'ready' });
  });
  authRoutes(app, runtime);
  app.use('/api/student/*', async (c, next) => { if (c.get('account').role !== 'STUDENT') throw new ApiError(403, 'FORBIDDEN', '仅学生可访问'); await next(); });
  app.use('/api/professor/*', async (c, next) => { if (c.get('account').role !== 'PROFESSOR') throw new ApiError(403, 'FORBIDDEN', '仅教授可访问'); await next(); });
  app.use('/api/registrar/*', async (c, next) => { if (c.get('account').role !== 'REGISTRAR') throw new ApiError(403, 'FORBIDDEN', '仅教务员可访问'); await next(); });
  app.get('/api/terms', async c => {
    query(c, z.object({}).strict()); const context = await runtime.termContext();
    return success(c, runtime, { terms: await Promise.all(context.terms.map(t => runtime.termView(t))), currentTermId: context.current.id, previousCompletedTermId: context.previous?.id ?? null, launchTermId: context.launch.id });
  });
  app.get('/api/catalog', async c => {
    const input = query(c, z.object({ termId: z.string().uuid() }).strict()); const account = c.get('account');
    if (account.role === 'REGISTRAR' && (await runtime.term(runtime.db, input.termId)).closeState !== 'CLOSED') throw new ApiError(403, 'FORBIDDEN', '教务员仅可在关闭后查询补选目录');
    return success(c, runtime, await catalog.view(input.termId, account.professorId ?? undefined));
  });
  app.get('/api/student/terms/:termId/notices', async c => {
    query(c, z.object({}).strict()); const notices = await runtime.db.catalogNotice.findMany({ where: { studentId: c.get('account').studentId!, termId: param(c, 'termId') }, orderBy: { createdAt: 'asc' } });
    return success(c, runtime, { notices: notices.map(n => ({ id: n.id, offeringId: n.offeringId, relatedOfferingId: n.relatedOfferingId, kind: n.kind, message: n.message, resolved: n.resolved, createdAt: n.createdAt.toISOString() })) });
  });
  app.get('/api/student/terms/:termId/schedule', async c => { query(c, z.object({}).strict()); return success(c, runtime, { schedule: await schedules.view(c.get('account').studentId!, param(c, 'termId')) }); });
  app.put('/api/student/terms/:termId/schedule', async c => { const input = await parseBody(c, contracts.scheduleWriteSchema); return success(c, runtime, await schedules.write(actor(c), param(c, 'termId'), input.expectedVersion, input, 'SAVE')); });
  app.post('/api/student/terms/:termId/schedule/submit', async c => { const input = await parseBody(c, contracts.scheduleWriteSchema); return success(c, runtime, await schedules.write(actor(c), param(c, 'termId'), input.expectedVersion, input, 'SUBMIT')); });
  app.delete('/api/student/terms/:termId/schedule', async c => { const input = await parseBody(c, contracts.confirmedVersionSchema); return success(c, runtime, await schedules.write(actor(c), param(c, 'termId'), input.expectedVersion, emptyChoices(), 'DELETE')); });
  app.get('/api/student/report-card', async c => {
    query(c, z.object({}).strict()); const { previous } = await runtime.termContext();
    if (!previous) return success(c, runtime, { term: null, rows: [] });
    const records = await runtime.db.gradeRecord.findMany({ where: { studentId: c.get('account').studentId!, termId: previous.id } });
    const registrations = await runtime.db.registration.findMany({ where: { studentId: c.get('account').studentId!, offering: { termId: previous.id }, state: { in: ['ENROLLED','COMMITTED'] } }, include: { offering: true } });
    const rows = records.map(r => ({ courseId: r.courseId, courseName: r.courseNameSnapshot, offeringId: r.offeringId, grade: r.value, source: r.source }));
    for (const r of registrations.filter(r => !records.some(g => g.courseId === r.offering.courseId))) {
      const course = await runtime.db.courseMirror.findUnique({ where: { externalCourseId: r.offering.courseId } }); rows.push({ courseId: r.offering.courseId, courseName: course?.name ?? r.offering.courseId, offeringId: r.offeringId, grade: null, source: 'PROFESSOR' });
    }
    return success(c, runtime, { term: await runtime.termView(previous), rows });
  });
  app.get('/api/professor/terms/:termId/teaching', async c => success(c, runtime, { teaching: await teaching.view(c.get('account').professorId!, param(c, 'termId')) }));
  app.put('/api/professor/terms/:termId/teaching', async c => {
    const input = await parseBody(c, contracts.teachingWriteSchema); requireRules(new Set(input.offeringIds).size === input.offeringIds.length ? [] : [{ code: 'DUPLICATE_OFFERING', message: '班次不能重复' }]);
    return success(c, runtime, await teaching.write(actor(c), param(c, 'termId'), input.expectedVersion, input.offeringIds));
  });
  app.get('/api/professor/terms/:termId/offerings', async c => {
    const result = await catalog.view(param(c, 'termId')); return success(c, runtime, { offerings: result.offerings.filter(o => o.professor?.id === c.get('account').professorId) });
  });
  app.get('/api/professor/offerings/:offeringId/roster', async c => success(c, runtime, await teaching.roster(actor(c), param(c, 'offeringId', false))));
  app.patch('/api/professor/offerings/:offeringId/grades', async c => { const input = await parseBody(c, contracts.gradeWriteSchema); return success(c, runtime, await teaching.saveGrades(actor(c), param(c, 'offeringId', false), input.cells)); });
  app.get('/api/professor/grade-context', async c => {
    const { previous, launch } = await runtime.termContext();
    if (!previous || previous.ordinal < launch.ordinal) return success(c, runtime, { term: null, offerings: [] });
    const snapshot = (await runtime.db.catalogSnapshot.findUnique({ where: { termId: previous.id } }))?.payload as unknown as Snapshot | undefined;
    const result = snapshot ? await catalog.view(previous.id, undefined, snapshot) : { offerings: [] };
    return success(c, runtime, { term: await runtime.termView(previous), offerings: result.offerings.filter(o => o.professor?.id === c.get('account').professorId) });
  });
  app.put('/api/registrar/terms/:termId/windows', async c => {
    const input = await parseBody(c, contracts.termWindowsSchema); const termId = param(c, 'termId'); const token = runtime.gates.admit(termId);
    try {
      const term = await runtime.transaction([termId], async tx => {
        await runtime.actor(tx, actor(c), 'REGISTRAR'); const prior = await runtime.term(tx, termId); if (prior.version !== input.expectedVersion) stale(prior.version);
        const { expectedVersion, ...strings } = input; const windows = Object.fromEntries(Object.entries(strings).map(([key, value]) => [key, new Date(value)])) as Pick<import('@prisma/client').Term, 'teachingStartsAt' | 'initialStartsAt' | 'initialEndsAt' | 'addDropStartsAt' | 'addDropEndsAt'>;
        requireRules(validWindows({ ...windows, closeState: 'OPEN' }) ? [] : [{ code: 'TIME_ORDER', message: '学期各阶段时间顺序无效' }]);
        const updated = await tx.term.update({ where: { id: termId }, data: { ...windows, version: { increment: 1 } } }); await runtime.audit(tx, actor(c), 'term.windows', 'Term', termId); return updated;
      }); return success(c, runtime, { term: await runtime.termView(term) });
    } finally { token.release(); }
  });
  app.post('/api/registrar/terms/:termId/close', async c => { await parseBody(c, contracts.closeSchema); return success(c, runtime, await close.request(actor(c), param(c, 'termId')), 202); });
  app.get('/api/registrar/terms/:termId/close-result', async c => {
    const term = await runtime.term(runtime.db, param(c, 'termId')); const result = term.closeResult as unknown as contracts.CloseResult | null;
    return success(c, runtime, { term: await runtime.termView(term), result: result ? { ...result, billing: await billing.summary(term.id) } : null });
  });
  app.get('/api/registrar/terms/:termId/billing', async c => {
    const input = query(c, z.object({ studentId: z.string().uuid().optional() }).strict()); const termId = param(c, 'termId'); await runtime.term(runtime.db, termId);
    const rows = await runtime.db.billingOutbox.findMany({ where: { termId, ...(input.studentId ? { studentId: input.studentId } : {}) } });
    return success(c, runtime, { items: rows.map(billingView).sort((a, b) => a.studentNumber.localeCompare(b.studentNumber) || b.version - a.version) });
  });
  app.get('/api/registrar/terms/:termId/supplement-context', async c => {
    const input = query(c, z.object({ studentId: z.string().uuid() }).strict()); const termId = param(c, 'termId'); const term = await runtime.term(runtime.db, termId);
    if (term.closeState !== 'CLOSED') throw new ApiError(409, 'PHASE_FORBIDDEN', '学期尚未关闭');
    return success(c, runtime, { student: personView(await people.find('students', input.studentId)), schedule: await schedules.view(input.studentId, termId), catalog: await catalog.view(termId) });
  });
  app.post('/api/registrar/terms/:termId/supplements', async c => { const input = await parseBody(c, contracts.supplementSchema); return success(c, runtime, await close.supplement(actor(c), param(c, 'termId'), input)); });
  app.post('/api/registrar/imports/:kind', async c => {
    const selected = contracts.importKindSchema.safeParse(c.req.param('kind')); if (!selected.success) throw new ApiError(400, 'INVALID_INPUT', '导入类别无效');
    if (Number(c.req.header('content-length') ?? 0) > 6 * 1024 * 1024) throw new ApiError(413, 'FILE_TOO_LARGE', '文件过大');
    let form: FormData; try { form = await c.req.formData(); } catch { throw new ApiError(400, 'INVALID_FILE', '上传内容无法解析'); }
    const entries = [...form.entries()]; const file = form.get('file');
    if (entries.length !== 1 || entries[0]?.[0] !== 'file' || !(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx')) throw new ApiError(400, 'INVALID_FILE', '仅接受一个 file 字段的 xlsx');
    if (file.size > 5 * 1024 * 1024) throw new ApiError(413, 'FILE_TOO_LARGE', '文件过大');
    return success(c, runtime, await imports.run(actor(c), selected.data, Buffer.from(await file.arrayBuffer())));
  });
  app.get('/api/registrar/:kind', async c => {
    const selected = kind(c); const input = query(c, contracts.peopleQuerySchema); const text = input.q ?? '';
    const whereStudent = { OR: [{ name: { contains: text, mode: 'insensitive' as const } }, { studentNumber: { contains: text, mode: 'insensitive' as const } }] };
    const whereProfessor = { OR: [{ name: { contains: text, mode: 'insensitive' as const } }, { professorNumber: { contains: text, mode: 'insensitive' as const } }] };
    const pagination = { skip: (input.page - 1) * input.pageSize, take: input.pageSize, include: { account: true } };
    const items = selected === 'students' ? await runtime.db.student.findMany({ ...pagination, where: whereStudent, orderBy: { studentNumber: 'asc' } }) : await runtime.db.professor.findMany({ ...pagination, where: whereProfessor, orderBy: { professorNumber: 'asc' } });
    const total = selected === 'students' ? await runtime.db.student.count({ where: whereStudent }) : await runtime.db.professor.count({ where: whereProfessor });
    return success(c, runtime, { items: items.map(personView), total, page: input.page, pageSize: input.pageSize });
  });
  app.get('/api/registrar/:kind/:id', async c => success(c, runtime, { person: personView(await people.find(kind(c), param(c, 'id'))) }));
  app.post('/api/registrar/:kind', async c => {
    const selected = kind(c); const input = selected === 'students' ? await parseBody(c, contracts.studentCreateSchema) : await parseBody(c, contracts.professorCreateSchema);
    return success(c, runtime, await people.create(actor(c), selected, input), 201);
  });
  app.post('/api/registrar/:kind/:id/impact-preview', async c => {
    const selected = kind(c); const input = selected === 'students' ? await parseBody(c, contracts.studentImpactPreviewSchema) : await parseBody(c, contracts.professorImpactPreviewSchema);
    return success(c, runtime, await people.preview(actor(c), selected, param(c, 'id'), input));
  });
  app.patch('/api/registrar/:kind/:id', async c => {
    const selected = kind(c); const input = selected === 'students' ? await parseBody(c, contracts.studentUpdateSchema) : await parseBody(c, contracts.professorUpdateSchema);
    return success(c, runtime, await people.update(actor(c), selected, param(c, 'id'), input));
  });
  app.delete('/api/registrar/:kind/:id', async c => { const input = await parseBody(c, contracts.confirmedVersionSchema); return success(c, runtime, await people.remove(actor(c), kind(c), param(c, 'id'), input.expectedVersion)); });
  app.all('/api/*', () => { throw new ApiError(404, 'NOT_FOUND', '接口不存在'); });
  return { app, runtime, catalog, schedules, teaching, billing, close, people, imports };
}
export const createApp = (deps: Dependencies) => createApplication(deps).app;
