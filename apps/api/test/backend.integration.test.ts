import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import ExcelJS from 'exceljs';
import * as dto from '@wylie/contracts';
import { createApplication } from '../src/app.js';
import { hashPassword, randomToken } from '../src/auth/password.js';
import { activeRegistration, json, type Hook, type Actor } from '../src/runtime/context.js';
import { recover, startRuntime } from '../src/runtime/start.js';
import { httpExternal } from '../src/runtime/external.js';
import { startSimulatorServer } from '../../simulators/src/server.js';
import type { Snapshot, BillingPayload, External } from '../src/runtime/external.js';

const baseUrl = process.env.TEST_DATABASE_URL;
describe('UC01–14 PostgreSQL 持久化开发自测（不替代独立验收）', () => {
  let db: PrismaClient; let application: ReturnType<typeof createApplication>;
  let now: Date; let snapshot: Snapshot; let hook: ((name: Hook) => Promise<void>) | undefined;
  let unavailable: boolean; let billingFailure: boolean; let sent: BillingPayload[];
  let password: string; let registrar: Actor; let professor: Actor; let otherProfessor: Actor;
  let studentActors: Actor[]; let studentIds: string[]; let professorId: string; let otherProfessorId: string;
  let termId: string; let previousId: string; let historicalId: string; let url: string;
  let connection: Client;
  const schema = `api_test_${randomUUID().replaceAll('-', '')}`;
  const config = { publicOrigin: 'http://localhost:5173', secureCookie: false, csrfSigningKey: randomToken(), impactSigningKey: randomToken(), pricePerCreditYuan: '123.45' };
  const choices = (primary = ['o1','o2','o3','o4'], alternate = ['o5','o6']) => ({ primaryOfferingIds: primary, alternateOfferingIds: alternate });
  const actor = (accountId: string): Actor => ({ accountId, requestId: randomUUID() });
  const external: External = {
    async catalog(id) { if (unavailable) throw Object.assign(new Error('Unavailable'), { status: 503, code: 'CATALOG_UNAVAILABLE' }); return { ...structuredClone(snapshot), termId: id, offerings: structuredClone(snapshot.offerings).map(o => ({ ...o, termId: id })) }; },
    async bill(payload) { sent.push(payload); if (billingFailure) throw new Error('Unavailable'); return { businessId: payload.businessId, version: payload.version, outcome: 'APPLIED', latestVersion: payload.version }; },
  };
  async function req(path: string, method = 'GET', body?: unknown, auth?: { cookie: string; csrf: string }) {
    const headers: Record<string, string> = { Origin: config.publicOrigin };
    if (auth) { headers.Cookie = auth.cookie; headers['X-CSRF-Token'] = auth.csrf; }
    let requestBody: string | FormData | undefined;
    if (body instanceof FormData) requestBody = body;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; requestBody = JSON.stringify(body); }
    return application.app.request(`http://localhost${path}`, { method, headers, ...(requestBody === undefined ? {} : { body: requestBody }) });
  }
  async function login(account: string) {
    const response = await req('/api/auth/login', 'POST', { account, password }); expect(response.status).toBe(200);
    const body = await response.json(); dto.responseSchemas.auth.parse(body.data);
    return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, csrf: body.data.csrfToken };
  }
  async function register(index: number, ids: string[], alternate: string[] = []) {
    await db.schedule.create({ data: { studentId: studentIds[index]!, termId, exists: true, version: 1, firstSubmittedAt: now, savedChoices: json(choices(ids, alternate)), submittedChoices: json(choices(ids, alternate)) } });
    await db.registration.createMany({ data: ids.map(offeringId => ({ studentId: studentIds[index]!, offeringId, source: 'SUBMIT' as const })) });
  }
  function barrier() {
    let arrived!: () => void; let release!: () => void;
    const reached = new Promise<void>(r => { arrived = r; }); const pause = new Promise<void>(r => { release = r; });
    return { reached, release, wait: async () => { arrived(); await pause; } };
  }
  beforeAll(async () => {
    if (!baseUrl) throw new Error('TEST_DATABASE_URL is required; run unit tests separately when PostgreSQL is unavailable');
    const parsed = new URL(baseUrl);
    if (!parsed.pathname.endsWith('_test')) throw new Error('Only a disposable _test database is allowed');
    connection = new Client({ connectionString: baseUrl! }); await connection.connect();
    await connection.query(`CREATE SCHEMA "${schema}"`); parsed.searchParams.set('schema', schema); url = parsed.toString();
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js','migrate','deploy','--schema','packages/db/prisma/schema.prisma'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
    db = new PrismaClient({ datasourceUrl: url }); password = randomToken();
  }, 30000);
  afterAll(async () => { await application?.runtime.settle(); await db?.$disconnect(); if (connection) { await connection.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await connection.end(); } });
  beforeEach(async () => {
    await application?.runtime.settle();
    const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
    await db.$executeRawUnsafe(`TRUNCATE ${tables.map(t => `"${t.tablename}"`).join(',')} RESTART IDENTITY CASCADE`);
    now = new Date('2026-10-05T08:00:00Z'); hook = undefined; unavailable = false; billingFailure = false; sent = [];
    termId = randomUUID(); previousId = randomUUID(); historicalId = randomUUID(); studentActors = []; studentIds = [];
    const hash = await hashPassword(password);
    await db.$transaction(async tx => {
      for (const [id, ordinal, from, through] of [[historicalId,1,'2025-01-01','2025-06-01'],[previousId,2,'2026-01-01','2026-09-01'],[termId,3,'2026-10-01','2027-01-01']] as const) {
        await tx.term.create({ data: { id, name: `Term${ordinal}`, ordinal, isLaunchTerm: ordinal === 2, startsAt: new Date(from), endsAt: new Date(through), teachingStartsAt: new Date('2026-09-01'), initialStartsAt: new Date('2026-10-01'), initialEndsAt: new Date('2026-10-07'), addDropStartsAt: new Date('2026-10-07'), addDropEndsAt: new Date('2026-10-10') } });
      }
      registrar = actor((await tx.account.create({ data: { account: 'registrar', role: 'REGISTRAR', passwordHash: hash, mustChangePassword: false } })).id);
      for (let i = 0; i < 16; i++) {
        const s = await tx.student.create({ data: { studentNumber: `S${String(i + 1).padStart(6,'0')}`, name: `Student${i}`, ssn: `000-00-${String(i).padStart(4,'0')}`, birthDate: new Date('2005-02-10') } });
        await tx.personIdentity.create({ data: { ssn: s.ssn, studentId: s.id } }); studentIds.push(s.id);
        studentActors.push(actor((await tx.account.create({ data: { account: s.studentNumber, role: 'STUDENT', studentId: s.id, passwordHash: hash, mustChangePassword: false } })).id));
      }
      for (let i = 0; i < 2; i++) {
        const p = await tx.professor.create({ data: { professorNumber: `P${String(i + 1).padStart(6,'0')}`, name: `Professor${i}`, ssn: `100-00-${i}`, birthDate: new Date('1980-01-01'), department: 'Testing' } });
        await tx.personIdentity.create({ data: { ssn: p.ssn, professorId: p.id } });
        const a = actor((await tx.account.create({ data: { account: p.professorNumber, role: 'PROFESSOR', professorId: p.id, passwordHash: hash, mustChangePassword: false } })).id);
        if (!i) { professor = a; professorId = p.id; } else { otherProfessor = a; otherProfessorId = p.id; }
        await tx.qualification.createMany({ data: Array.from({ length: 8 }, (_, j) => ({ professorId: p.id, courseId: `c${j + 1}` })) });
      }
    });
    await db.$queryRaw`SELECT setval('student_number_seq', 16, true), setval('professor_number_seq', 2, true)`;
    snapshot = { revision: '1', termId, courses: Array.from({ length: 8 }, (_, i) => ({ id: `c${i + 1}`, name: `Course${i + 1}`, department: 'Testing', credits: i === 0 ? '1.25' : '2.30', prerequisiteCourseIds: [] })), offerings: Array.from({ length: 8 }, (_, i) => ({ id: `o${i + 1}`, termId, courseId: `c${i + 1}`, meetings: [{ dayOfWeek: 1, startMinute: 60 * i, endMinute: 60 * i + 50, fromDate: '2026-10-01', throughDate: '2026-12-31' }] })) };
    application = createApplication({ db, config, external, clock: () => now, fault: name => hook?.(name) ?? Promise.resolve(), log: () => {} });
    await recover(application); application.runtime.ready = true;
    await application.catalog.fresh(termId);
    await application.teaching.write(professor, termId, 0, ['o1','o2','o3','o4','o5','o6','o7','o8']);
  });

  it('AC01/02/37–43：session、同源、CSRF、角色、首次改密、旧密码/旧会话撤销', async () => {
    expect((await req('/api/student/report-card')).status).toBe(401);
    expect((await req('/api/auth/login','POST',{ account:'registrar', password:'wrong' })).status).toBe(401);
    const student = await login('S000001'); const admin = await login('registrar');
    expect((await req('/api/registrar/students','GET',undefined,student)).status).toBe(403);
    expect((await req('/api/student/report-card?studentId='+studentIds[1],'GET',undefined,student)).status).toBe(400);
    const me = await (await req('/api/auth/me','GET',undefined,student)).json(); expect(me.data.csrfToken).toBe(student.csrf);
    const badCsrf = await req(`/api/student/terms/${termId}/schedule`,'PUT',{ ...choices([],[]), expectedVersion:0 },{ ...student, csrf:'bad' }); expect(badCsrf.status).toBe(403);
    const created = await application.people.create(registrar,'students',{ name:'New', birthDate:'2006-01-01', ssn:'009-00-0001', status:'ACTIVE', graduationDate:null, accountEnabled:true });
    const response = await req('/api/auth/login','POST',{ account:created.initialCredential.account, password:created.initialCredential.initialPassword });
    const payload = await response.json(); const initial = { cookie: response.headers.get('set-cookie')!.split(';')[0]!, csrf: payload.data.csrfToken };
    expect(payload.data.user.mustChangePassword).toBe(true); expect((await req('/api/terms','GET',undefined,initial)).status).toBe(403);
    const newPassword = randomToken(); const changed = await req('/api/auth/change-password','POST',{ currentPassword:created.initialCredential.initialPassword,newPassword },initial); expect(changed.status).toBe(200);
    expect((await req('/api/auth/me','GET',undefined,initial)).status).toBe(401);
    expect((await req('/api/auth/login','POST',{ account:created.initialCredential.account,password:created.initialCredential.initialPassword })).status).toBe(401);
    const secretRecords = await db.account.findMany(); expect(secretRecords.every(a => a.passwordHash.startsWith('scrypt$') && !a.passwordHash.includes(password))).toBe(true);
    const queried = await (await req('/api/registrar/students','GET',undefined,admin)).json(); dto.responseSchemas.people.parse(queried.data); expect(JSON.stringify(queried)).not.toContain('000-00-0000');
    expect(await db.auditEvent.count({ where: { result:'FAILED' } })).toBeGreaterThan(0);
  });
  it('AC05/06/10/13/49/64：保存不动名册，提交/换班整份生效，旧页拒绝', async () => {
    const student = await login('S000001'); const path = `/api/student/terms/${termId}/schedule`;
    const saved = await req(path,'PUT',{ ...choices(['o1'],['o6','o5']),expectedVersion:0 },student); expect(saved.status).toBe(200);
    dto.responseSchemas.schedule.parse((await saved.json()).data); expect(await db.registration.count()).toBe(0);
    expect((await req(path,'PUT',{ ...choices([],[]),expectedVersion:0 },student)).status).toBe(409);
    const submitted = await req(path+'/submit','POST',{ ...choices(),expectedVersion:1 },student); expect(submitted.status).toBe(200);
    const s = (await submitted.json()).data.schedule; expect(s.version).toBe(2); expect(s.firstSubmittedAt).toBe(now.toISOString()); expect(s.registrations).toHaveLength(4);
    expect((await req(path+'/submit','POST',{ ...choices(),expectedVersion:1 },student)).status).toBe(409);
    await application.schedules.write(studentActors[0]!,termId,2,choices(['o2','o3','o4','o7'],[]),'SAVE');
    expect((await application.schedules.view(studentIds[0]!,termId)).registrations.map(r => r.offeringId)).toContain('o1');
    await application.schedules.write(studentActors[0]!,termId,3,choices(['o2','o3','o4','o7'],[]),'SUBMIT');
    await application.schedules.write(studentActors[0]!,termId,4,choices(['o2','o3','o4','o7'],[]),'SUBMIT');
    expect(await db.registration.count({ where: { studentId:studentIds[0]!, ...activeRegistration } })).toBe(4);
    expect(await db.registration.count({ where: { studentId:studentIds[0]!, offeringId:'o1',state:'REMOVED' } })).toBe(1);
  });
  it('AC07/47/48：全部先修及格；备选可满/冲突/同课程但取消或先修失败整份回滚', async () => {
    await expect(application.schedules.write(studentActors[0]!,termId,0,choices(['o1','o2','o3'],['o5','o6']),'SUBMIT')).rejects.toMatchObject({ code:'RULE_VIOLATION' });
    snapshot.courses[0]!.prerequisiteCourseIds = ['c7','c8']; snapshot.revision = '2';
    await db.gradeRecord.create({ data: { studentId:studentIds[0]!,termId:historicalId,courseId:'c7',value:'D',source:'IMPORT',courseNameSnapshot:'prior' } });
    await expect(application.schedules.write(studentActors[0]!,termId,0,choices(),'SUBMIT')).rejects.toMatchObject({ code:'RULE_VIOLATION' });
    await db.gradeRecord.create({ data: { studentId:studentIds[0]!,termId:historicalId,courseId:'c8',value:'I',source:'IMPORT',courseNameSnapshot:'prior' } });
    await expect(application.schedules.write(studentActors[0]!,termId,0,choices(),'SUBMIT')).rejects.toMatchObject({ code:'RULE_VIOLATION' });
    await db.gradeRecord.updateMany({ where: { courseId:'c8' },data:{value:'A'} });
    snapshot.offerings[4]!.meetings = snapshot.offerings[0]!.meetings; snapshot.offerings.push({ ...snapshot.offerings[5]!, id: 'o1-alt', courseId: 'c1' }); snapshot.revision = '3';
    await db.registration.createMany({ data: studentIds.slice(1,11).map(studentId => ({ studentId,offeringId:'o5',source:'SUBMIT' as const })) });
    const s = await application.schedules.write(studentActors[0]!,termId,0,choices(['o1','o2','o3','o4'],['o5','o1-alt']),'SUBMIT'); expect(s.schedule.registrations).toHaveLength(4);
    await db.offering.update({ where: { externalOfferingId:'o1-alt' }, data:{status:'CANCELLED'} });
    await expect(application.schedules.write(studentActors[0]!,termId,1,choices(['o1','o2','o3','o4'],['o5','o1-alt']),'SUBMIT')).rejects.toMatchObject({ code:'RULE_VIOLATION' });
    expect((await application.schedules.view(studentIds[0]!,termId)).version).toBe(1);
  });
  it('AC08：真实PG两学生并发抢第10位仅一个成功，失败保留旧班', async () => {
    await db.registration.createMany({ data: studentIds.slice(0,9).map(studentId => ({ studentId,offeringId:'o1',source:'SUBMIT' as const })) });
    await register(9,['o7']); await register(10,['o8']);
    const results = await Promise.allSettled([application.schedules.write(studentActors[9]!,termId,1,choices(['o1'],[]),'SUBMIT'),application.schedules.write(studentActors[10]!,termId,1,choices(['o1'],[]),'SUBMIT')]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results.findIndex(r => r.status === 'rejected'); expect((results[loser] as PromiseRejectedResult).reason.code).toBe('OFFERING_FULL');
    expect(await db.registration.count({ where: { offeringId:'o1', ...activeRegistration } })).toBe(10);
    expect((await application.schedules.view(studentIds[9+loser]!,termId)).registrations[0]!.offeringId).toBe(loser ? 'o8' : 'o7');
  });
  it('AC11/12/63：确认删除释放容量与首次时间，墓碑版本不复用，重建须4+2', async () => {
    await application.schedules.write(studentActors[0]!,termId,0,choices(),'SUBMIT');
    const auth = await login('S000001'); const path = `/api/student/terms/${termId}/schedule`;
    expect((await req(path,'DELETE',{expectedVersion:1,confirmed:false},auth)).status).toBe(400);
    await application.schedules.write(studentActors[0]!,termId,1,choices([],[]),'DELETE');
    const deleted = await application.schedules.view(studentIds[0]!,termId); expect(deleted.exists).toBe(false); expect(deleted.version).toBe(2); expect(deleted.firstSubmittedAt).toBeNull(); expect(deleted.registrations).toHaveLength(0);
    await expect(application.schedules.write(studentActors[0]!,termId,2,choices(['o1','o2','o3'],['o5','o6']),'SUBMIT')).rejects.toMatchObject({code:'RULE_VIOLATION'});
    now = new Date('2026-10-06T08:00:00Z'); const renewed = await application.schedules.write(studentActors[0]!,termId,2,choices(),'SUBMIT'); expect(renewed.schedule.firstSubmittedAt).toBe(now.toISOString());
  });
  it('AC50/56：最终确认跨自然截止整份回滚；合法窗口和时间顺序', async () => {
    const admin = await login('registrar'); const term = await db.term.findUniqueOrThrow({ where:{id:termId} });
    const input = { expectedVersion:term.version, teachingStartsAt:term.teachingStartsAt.toISOString(),initialStartsAt:term.initialStartsAt.toISOString(),initialEndsAt:term.initialEndsAt.toISOString(),addDropStartsAt:term.addDropStartsAt.toISOString(),addDropEndsAt:term.addDropEndsAt.toISOString() };
    expect((await req(`/api/registrar/terms/${termId}/windows`,'PUT',{...input,teachingStartsAt:'2026-10-02T00:00:00Z'},admin)).status).toBe(422);
    expect((await req(`/api/registrar/terms/${termId}/windows`,'PUT',input,admin)).status).toBe(200);
    now = new Date('2026-10-09T23:59:59Z'); hook = async name => { if (name === 'submit.beforeConfirm') now = new Date('2026-10-10T00:00:00Z'); };
    await expect(application.schedules.write(studentActors[0]!,termId,0,choices(),'SUBMIT')).rejects.toMatchObject({code:'PHASE_FORBIDDEN'});
    expect(await db.registration.count()).toBe(0); expect(await db.schedule.count()).toBe(0);
    hook = undefined; now = new Date('2026-10-09T23:59:59.999Z'); await application.schedules.write(studentActors[0]!,termId,0,choices(),'SUBMIT');
    now = new Date('2026-10-10T00:00:00Z'); await expect(application.schedules.write(studentActors[0]!,termId,1,choices(),'SAVE')).rejects.toMatchObject({code:'PHASE_FORBIDDEN'});
  });
  it('AC14/51：授课历史使用同一业务时钟记录开始、取消与重选', async () => {
    const selected = await db.teachingHistory.findFirstOrThrow({ where: { professorId, offeringId: 'o3' } });
    expect(selected.createdAt.toISOString()).toBe('2026-10-05T08:00:00.000Z');
    now = new Date('2026-10-05T08:00:07Z');
    await application.teaching.write(professor, termId, 1, ['o1', 'o2']);
    const cancelled = await db.teachingHistory.findUniqueOrThrow({ where: { id: selected.id } });
    expect(cancelled.endedAt?.toISOString()).toBe('2026-10-05T08:00:07.000Z');
    expect(await db.teachingHistory.count({ where: { professorId, endedAt: null } })).toBe(2);
    now = new Date('2026-10-05T08:00:11Z');
    await application.teaching.write(professor, termId, 2, ['o1', 'o2', 'o3']);
    const reselected = await db.teachingHistory.findFirstOrThrow({ where: { professorId, offeringId: 'o3', endedAt: null } });
    expect(reselected.createdAt.toISOString()).toBe('2026-10-05T08:00:11.000Z');
    expect(reselected.id).not.toBe(selected.id);
    expect(await db.teachingHistory.count({ where: { professorId, offeringId: 'o3' } })).toBe(2);
  });
  it('AC14–18/39/51：授课争抢仅一位教授，失败取消也不生效；名册仅已注册', async () => {
    await application.teaching.write(professor,termId,1,['o1','o2']);
    const results = await Promise.allSettled([application.teaching.write(professor,termId,2,['o1','o3']),application.teaching.write(otherProfessor,termId,0,['o3'])]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1); expect((results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.code).toBe('OFFERING_TAKEN');
    snapshot.offerings[3]!.meetings = snapshot.offerings[0]!.meetings; snapshot.revision='2';
    const own = await application.teaching.view(professorId,termId);
    await expect(application.teaching.write(professor,termId,own.version,['o1','o4'])).rejects.toMatchObject({code:'RULE_VIOLATION'});
    expect((await application.teaching.view(professorId,termId)).offeringIds).toEqual(own.offeringIds);
    await register(0,['o1']); await application.schedules.write(studentActors[1]!,termId,0,choices(['o1'],[]),'SAVE');
    const roster = await application.teaching.roster(professor,'o1'); expect(roster.students.map(s=>s.studentId)).toEqual([studentIds[0]]);
    await expect(application.teaching.roster(otherProfessor,'o1')).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('AC19–23/39：上一完成且上线以后录分；六种值、空格/Z逐格结果，越权整份拒绝', async () => {
    const previousSnapshot = { ...snapshot,termId:previousId,offerings:snapshot.offerings.map(o=>({...o,id:`prev-${o.id}`,termId:previousId})) };
    await application.catalog.apply(previousSnapshot); await db.offering.update({ where:{externalOfferingId:'prev-o1'},data:{professorId} });
    await db.registration.createMany({data:studentIds.slice(0,10).map(studentId=>({studentId,offeringId:'prev-o1',source:'SUBMIT' as const,state:'COMMITTED' as const}))});
    const values = ['A','B','C','D','F','I']; await application.teaching.saveGrades(professor,'prev-o1',values.map((grade,i)=>({studentId:studentIds[i]!,grade})));
    const mixed = await application.teaching.saveGrades(professor,'prev-o1',[{studentId:studentIds[1]!,grade:''},{studentId:studentIds[6]!,grade:'Z'},{studentId:studentIds[7]!,grade:'I'}]);
    expect(mixed.results.map(r=>r.outcome)).toEqual(['UNCHANGED','REJECTED','SAVED']); expect(mixed.results[0]!.grade).toBe('B'); expect(mixed.results[2]!.grade).toBe('I');
    const ten=await application.teaching.saveGrades(professor,'prev-o1',['A','','C','D','F','I','Z','I','B','C'].map((grade,i)=>({studentId:studentIds[i]!,grade})));
    expect(ten.results.filter(r=>r.outcome==='SAVED')).toHaveLength(8);expect(ten.results[1]).toMatchObject({outcome:'UNCHANGED',grade:'B'});expect(ten.results[6]).toMatchObject({outcome:'REJECTED',grade:null});
    await expect(application.teaching.saveGrades(professor,'prev-o1',[{studentId:studentIds[0]!,grade:'D'},{studentId:studentIds[15]!,grade:'A'}])).rejects.toMatchObject({code:'FORBIDDEN'});
    expect((await db.gradeRecord.findFirstOrThrow({where:{studentId:studentIds[0]!,offeringId:'prev-o1'}})).value).toBe('A');
    await expect(application.teaching.saveGrades(professor,'o1',[])).rejects.toMatchObject({code:'FORBIDDEN'});
    const auth = await login('S000001'); const report = await (await req('/api/student/report-card','GET',undefined,auth)).json(); dto.responseSchemas.reportCard.parse(report.data); expect(report.data.term.id).toBe(previousId); expect(report.data.rows[0].grade).toBe('A');
    const none = await login('S000016'); expect((await (await req('/api/student/report-card','GET',undefined,none)).json()).data.rows).toEqual([]);
  });
  it('AC24–27/44/52/53：编号稳定/删除保护，状态确认清理开放学期而保留历史', async () => {
    await register(0,['o1','o2','o3','o4']);
    const preview = await application.people.preview(registrar,'students',studentIds[0]!,{expectedVersion:1,patch:{status:'SUSPENDED'}});
    await application.people.update(registrar,'students',studentIds[0]!,{expectedVersion:1,patch:{status:'SUSPENDED'},confirmed:true,impactToken:preview.impact.impactToken});
    expect(await db.registration.count({where:{studentId:studentIds[0]!,...activeRegistration}})).toBe(0);
    const auth = await login('S000001'); expect((await req('/api/student/report-card','GET',undefined,auth)).status).toBe(200); expect((await req(`/api/student/terms/${termId}/schedule`,'GET',undefined,auth)).status).toBe(403);
    await expect(application.people.remove(registrar,'students',studentIds[0]!,2)).rejects.toMatchObject({code:'HAS_RECORDS'});
    const newStudent = await application.people.create(registrar,'students',{name:'To delete',birthDate:'2005-01-01',ssn:'000-09-0123',status:'ACTIVE',graduationDate:null,accountEnabled:true});
    await application.people.remove(registrar,'students',newStudent.person.id,1); expect(await db.student.findUnique({where:{id:newStudent.person.id}})).toBeNull();
    const p = await application.people.preview(registrar,'professors',professorId,{expectedVersion:1,patch:{status:'DEPARTED'}});
    await application.people.update(registrar,'professors',professorId,{expectedVersion:1,patch:{status:'DEPARTED'},confirmed:true,impactToken:p.impact.impactToken});
    expect(await db.offering.count({where:{termId,professorId}})).toBe(0); expect((await req('/api/auth/login','POST',{account:'P000001',password})).status).toBe(401);
  });
  it('状态preview后新保存/关闭会使token失效，不能仅confirmed绕过', async () => {
    const preview = await application.people.preview(registrar,'students',studentIds[0]!,{expectedVersion:1,patch:{status:'GRADUATED'}});
    await application.schedules.write(studentActors[0]!,termId,0,choices(['o1'],[]),'SAVE');
    await expect(application.people.update(registrar,'students',studentIds[0]!,{expectedVersion:1,patch:{status:'GRADUATED'},confirmed:true,impactToken:preview.impact.impactToken})).rejects.toMatchObject({code:'IMPACT_CHANGED'});
    expect((await db.student.findUniqueOrThrow({where:{id:studentIds[0]!}})).status).toBe('ACTIVE');
  });
  it('AC28/33/55：提前关闭drain在途提交，故障恢复不回滚在途结果', async () => {
    const b = barrier(); hook = name => name === 'submit.beforeConfirm' ? b.wait() : name === 'close.afterLeveling' ? Promise.reject(new Error('Injected')) : Promise.resolve();
    const pending = application.schedules.write(studentActors[0]!,termId,0,choices(),'SUBMIT'); await b.reached;
    await application.close.request(registrar,termId);
    await expect(application.schedules.write(studentActors[1]!,termId,0,choices(),'SUBMIT')).rejects.toMatchObject({code:'CLOSING'});
    await expect(application.close.request(registrar,termId)).rejects.toMatchObject({code:'CLOSING'});
    b.release(); await pending; await application.runtime.settle();
    expect((await db.term.findUniqueOrThrow({where:{id:termId}})).closeState).toBe('OPEN'); expect(await db.registration.count({where:activeRegistration})).toBe(4); expect(await db.billingOutbox.count()).toBe(0);
    hook = undefined; await application.close.request(registrar,termId); await application.runtime.settle(); expect((await db.term.findUniqueOrThrow({where:{id:termId}})).closeState).toBe('CLOSED');
  });
  it('AC29–34/54：2人班调剂补到3保留，顺序与只一轮，保存不替代submitted，零元同事务', async () => {
    await application.teaching.write(professor,termId,1,['o1','o2','o3','o4','o5']);
    await register(0,['o1','o2','o3','o6'],['o5','o7']); await register(1,['o1','o2','o3','o4']); await register(2,['o1','o2','o3','o4']);
    await register(3,['o5']); await register(4,['o5']);
    await application.schedules.write(studentActors[0]!,termId,1,choices(['o7'],[]),'SAVE'); await application.schedules.write(studentActors[5]!,termId,0,choices(['o1'],[]),'SAVE');
    await application.close.request(registrar,termId); await application.runtime.settle();
    const term = await db.term.findUniqueOrThrow({where:{id:termId}}); expect(term.closeState).toBe('CLOSED');
    expect((await db.offering.findUniqueOrThrow({where:{externalOfferingId:'o5'}})).status).toBe('CLOSED'); expect((await db.offering.findUniqueOrThrow({where:{externalOfferingId:'o4'}})).status).toBe('CANCELLED');
    const result = term.closeResult as unknown as dto.CloseResult; expect(result.leveled).toEqual([{studentId:studentIds[0],offeringId:'o5',alternateIndex:0}]);
    expect((await application.schedules.view(studentIds[0]!,termId)).saved).toEqual(choices(['o1','o2','o3','o5'],['o7']));
    const zero = await db.billingOutbox.findFirstOrThrow({where:{studentId:studentIds[5]!}}); expect(zero.amountYuan.toFixed(2)).toBe('0.00'); expect(await db.billingOutbox.count()).toBe(16);
    const bill = await db.billingOutbox.findFirstOrThrow({where:{studentId:studentIds[0]!}}); expect(bill.amountYuan.toFixed(2)).toBe('1006.12'); expect(JSON.stringify(bill.payload)).not.toContain('grade');
    await expect(application.close.request(registrar,termId)).rejects.toMatchObject({code:'ALREADY_CLOSED'});
  });
  it('AC55：beforeCommit注入故障使关闭/注册/账单一起回滚', async () => {
    await register(0,['o1']); hook = async name => { if(name==='close.beforeCommit') throw new Error('fault'); };
    await application.close.request(registrar,termId); await application.runtime.settle();
    expect((await db.term.findUniqueOrThrow({where:{id:termId}})).closeState).toBe('OPEN'); expect(await db.billingOutbox.count()).toBe(0); expect(await db.registration.count({where:activeRegistration})).toBe(1);
  });
  it('AC35/36：持久化60秒重试和lease重启恢复同businessId', async () => {
    await application.close.request(registrar,termId); await application.runtime.settle(); billingFailure=true;
    await application.billing.tick(); const prior = await db.billingOutbox.findFirstOrThrow(); expect(prior.status).toBe('RETRY'); expect(prior.nextAttemptAt.getTime()-now.getTime()).toBe(60000);
    const attempts=sent.length; now=new Date(now.getTime()+59999); await application.billing.tick(); expect(sent).toHaveLength(attempts);
    now=new Date(now.getTime()+1); billingFailure=false; hook=async name=>{if(name==='billing.afterSendBeforeAckPersist')throw new Error('process crash');};
    await expect(application.billing.tick()).rejects.toThrow('process crash'); const inflight=await db.billingOutbox.findFirstOrThrow({where:{status:'IN_FLIGHT'}});
    now=new Date(now.getTime()+60000); hook=undefined;
    const restarted=createApplication({db,config,external,clock:()=>now,log:()=>{}}); await recover(restarted); await restarted.billing.tick();
    expect((await db.billingOutbox.findUniqueOrThrow({where:{id:inflight.id}})).status).toBe('ACKNOWLEDGED'); expect(sent.filter(p=>p.businessId===inflight.businessId).length).toBeGreaterThanOrEqual(2); expect(await db.billingOutbox.count()).toBe(16);
  });
  it('AC57/58/62：补选第10位与新账单原子，满班/取消/四门失败不增账单', async () => {
    for(let i=0;i<9;i++)await register(i,['o1']);
    await application.close.request(registrar,termId);await application.runtime.settle();
    const supplemented=await application.close.supplement(registrar,termId,{studentId:studentIds[9]!,offeringId:'o1',expectedVersion:0});expect(supplemented.billing.version).toBe(2);expect(supplemented.billing.amountYuan).toBe('154.31');
    await expect(application.close.supplement(registrar,termId,{studentId:studentIds[10]!,offeringId:'o1',expectedVersion:0})).rejects.toMatchObject({code:'OFFERING_FULL'});
    await expect(application.close.supplement(registrar,termId,{studentId:studentIds[10]!,offeringId:'o2',expectedVersion:0})).rejects.toMatchObject({code:'RULE_VIOLATION'});
    expect(await db.billingOutbox.count()).toBe(17);expect(await db.registration.count({where:{offeringId:'o1',...activeRegistration}})).toBe(10);
    const old=await db.billingOutbox.findFirstOrThrow({where:{studentId:studentIds[9]!,version:1}});expect(old.status).toBe('SUPERSEDED');
  });
  it('AC45/46：GET目录只读，后台复查保留冲突课并通知，删除班次清课表/名册', async () => {
    await application.schedules.write(studentActors[0]!,termId,0,choices(),'SUBMIT');
    snapshot.offerings[1]!.meetings=snapshot.offerings[0]!.meetings;snapshot.revision='2';
    snapshot.courses[0]!.prerequisiteCourseIds=['c8'];
    await expect(application.catalog.view(termId)).rejects.toMatchObject({code:'CATALOG_CHANGED'});expect(await db.catalogNotice.count()).toBe(0);
    await application.catalog.fresh(termId);expect(await db.registration.count({where:activeRegistration})).toBe(4);expect(await db.catalogNotice.count({where:{kind:'TIME_CONFLICT',resolved:false}})).toBe(1);
    expect(await db.catalogNotice.count({where:{kind:'PREREQUISITE',resolved:false}})).toBe(1);
    await application.catalog.fresh(termId);expect(await db.catalogNotice.count()).toBe(2);
    await expect(application.schedules.write(studentActors[0]!,termId,1,choices(),'SUBMIT')).rejects.toMatchObject({code:'RULE_VIOLATION'});
    snapshot.offerings=snapshot.offerings.filter(o=>o.id!=='o2');snapshot.revision='3';await application.catalog.fresh(termId);
    const s=await application.schedules.view(studentIds[0]!,termId);expect(s.registrations).toHaveLength(3);expect((s.saved as dto.Choices).primaryOfferingIds).not.toContain('o2');expect(s.version).toBe(2);
    expect(await db.catalogNotice.count({where:{kind:'OFFERING_DELETED'}})).toBe(1);
  });
  it('AC59–61：真实xlsx逐行3新/1重复/1坏，前导零和公式拒绝，历史不覆盖/上线拒绝、资格去重', async () => {
    const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('students');sheet.addRow(['name','birthDate','ssn','status']);
    for(let i=1;i<=3;i++)sheet.addRow([`Import${i}`,'2005-01-01',`001-00-000${i}`,'ACTIVE']);sheet.addRow(['Duplicate','2005-01-01','000-00-0000','ACTIVE']);sheet.addRow(['','2005-01-01','001-00-0004','ACTIVE']);
    const admin=await login('registrar');const form=new FormData();form.append('file',new File([await workbook.xlsx.writeBuffer() as ArrayBuffer],'students.xlsx'));
    const response=await req('/api/registrar/imports/students','POST',form,admin);expect(response.status).toBe(200);const data=(await response.json()).data;dto.responseSchemas.imports.parse(data);expect([data.imported,data.skipped,data.rejected]).toEqual([3,1,1]);expect(new Set(data.rows.filter((r:dto.ImportRow)=>r.initialPassword).map((r:dto.ImportRow)=>r.initialPassword)).size).toBe(3);
    const imported=await db.student.findUniqueOrThrow({where:{ssn:'001-00-0001'}});expect(imported.ssn.startsWith('001')).toBe(true);
    const grades=new ExcelJS.Workbook();const g=grades.addWorksheet('grades');g.addRow(['studentNumber','courseId','termId','grade']);g.addRow(['S000001','c1',historicalId,'B']);g.addRow(['S000001','c1',historicalId,'A']);g.addRow(['S000001','c2',termId,'A']);
    const result=await application.imports.run(registrar,'historical-grades',Buffer.from(await grades.xlsx.writeBuffer()));expect([result.imported,result.skipped,result.rejected]).toEqual([1,1,1]);expect((await db.gradeRecord.findFirstOrThrow({where:{courseId:'c1'}})).value).toBe('B');
    await db.qualification.delete({where:{professorId_courseId:{professorId:otherProfessorId,courseId:'c8'}}});const qualifications=new ExcelJS.Workbook();const q=qualifications.addWorksheet('q');q.addRow(['professorNumber','courseId']);q.addRow(['P000002','c8']);q.addRow(['P000002','c8']);
    const qr=await application.imports.run(registrar,'qualifications',Buffer.from(await qualifications.xlsx.writeBuffer()));expect([qr.imported,qr.skipped]).toEqual([1,1]);
    expect((await application.catalog.view(termId,otherProfessorId)).offerings.find(o=>o.id==='o8')!.eligibleToTeach).toBe(true);
    sheet.getCell('A2').value={formula:'"forbidden"',result:'forbidden'};const formulas=await application.imports.run(registrar,'students',Buffer.from(await workbook.xlsx.writeBuffer()));expect(formulas.rows[0]!.outcome).toBe('REJECTED');
  });
  it('AC32：先按首次提交时间、同时间按学号争最后备选位', async () => {
    await db.registration.createMany({data:studentIds.slice(3,12).map(studentId=>({studentId,offeringId:'o5',source:'SUBMIT' as const}))});
    await register(0,['o1','o2','o3'],['o5']); await register(1,['o1','o2','o3'],['o5']); await register(2,['o1','o2','o3'],['o5']);
    await db.schedule.updateMany({where:{studentId:studentIds[2]!},data:{firstSubmittedAt:new Date(now.getTime()-1)}});
    await application.close.request(registrar,termId); await application.runtime.settle();
    const result=(await db.term.findUniqueOrThrow({where:{id:termId}})).closeResult as unknown as dto.CloseResult;
    expect(result.leveled).toEqual([{studentId:studentIds[2],offeringId:'o5',alternateIndex:0}]);
    // Repeat on a fresh term: equal timestamps are ordered by stable student number,
    // not the insertion order or randomly allocated UUID.
    const secondId=randomUUID(); const current=await db.term.findUniqueOrThrow({where:{id:termId}});
    await db.term.create({data:{...current,id:secondId,ordinal:4,isLaunchTerm:false,closeState:'OPEN',closedAt:null,closeAttemptId:null,closeResult:Prisma.DbNull,closedCatalogSnapshot:Prisma.DbNull,lastCloseError:Prisma.DbNull}});
    const secondSnapshot={...snapshot,termId:secondId,offerings:snapshot.offerings.map(o=>({...o,id:`tie-${o.id}`,termId:secondId}))};
    await application.catalog.apply(secondSnapshot);
    await db.offering.updateMany({where:{termId:secondId},data:{professorId}});
    await db.registration.createMany({data:studentIds.slice(3,12).map(studentId=>({studentId,offeringId:'tie-o5',source:'SUBMIT' as const}))});
    for(const index of [1,0]){
      await db.schedule.create({data:{studentId:studentIds[index]!,termId:secondId,version:1,exists:true,firstSubmittedAt:now,savedChoices:json(choices(['tie-o1','tie-o2','tie-o3'],['tie-o5'])),submittedChoices:json(choices(['tie-o1','tie-o2','tie-o3'],['tie-o5']))}});
      await db.registration.createMany({data:['tie-o1','tie-o2','tie-o3'].map(offeringId=>({studentId:studentIds[index]!,offeringId,source:'SUBMIT' as const}))});
    }
    // This test supplies the complete second-term authority instead of fabricating
    // a revision during the closing transaction.
    const tieApp=createApplication({db,config,external:{...external,catalog:async()=>secondSnapshot},clock:()=>now,log:()=>{}});
    await recover(tieApp); await tieApp.close.request(registrar,secondId); await tieApp.runtime.settle();
    const tieResult=(await db.term.findUniqueOrThrow({where:{id:secondId}})).closeResult as unknown as dto.CloseResult;
    expect(tieResult.leveled).toEqual([{studentId:studentIds[0],offeringId:'tie-o5',alternateIndex:0}]);
  });
  it('AC30：调剂逐个跳过同课程、冲突、先修失败和无教授', async () => {
    snapshot.offerings.push({...snapshot.offerings[0]!,id:'same-o1'}); snapshot.offerings[5]!.meetings=snapshot.offerings[0]!.meetings;
    snapshot.courses[6]!.prerequisiteCourseIds=['c8']; snapshot.revision='2'; await application.catalog.fresh(termId);
    await db.offering.update({where:{externalOfferingId:'same-o1'},data:{professorId}});
    await db.offering.update({where:{externalOfferingId:'o8'},data:{professorId:null}});
    await register(0,['o1','o2','o3'],['same-o1','o6']);
    await register(1,['o1','o2','o3'],['o7','o8']); await register(2,['o1','o2','o3']);
    await application.close.request(registrar,termId); await application.runtime.settle();
    const result=(await db.term.findUniqueOrThrow({where:{id:termId}})).closeResult as unknown as dto.CloseResult;
    expect(result.leveled).toEqual([]); expect((await application.schedules.view(studentIds[0]!,termId)).registrations).toHaveLength(3);
  });
  it('AC62：已四门、同课程/冲突、先修失败补选都不写注册或新账单', async () => {
    for(let i=0;i<3;i++)await register(i,['o1','o2','o3','o4']);
    for(let i=3;i<6;i++)await register(i,['o5','o6','o7','o8']);
    await application.close.request(registrar,termId);await application.runtime.settle();
    const before=await db.billingOutbox.count();
    await expect(application.close.supplement(registrar,termId,{studentId:studentIds[0]!,offeringId:'o5',expectedVersion:2})).rejects.toMatchObject({code:'RULE_VIOLATION'});
    // Student7 has no schedule yet; first supplement starts version1.
    await application.close.supplement(registrar,termId,{studentId:studentIds[6]!,offeringId:'o1',expectedVersion:0});
    snapshot.offerings[4]!.courseId='c1';
    await expect(application.close.supplement(registrar,termId,{studentId:studentIds[6]!,offeringId:'o5',expectedVersion:1})).rejects.toMatchObject({code:'RULE_VIOLATION'});
    snapshot.offerings[4]!.courseId='c5';snapshot.offerings[4]!.meetings=snapshot.offerings[0]!.meetings;
    await expect(application.close.supplement(registrar,termId,{studentId:studentIds[6]!,offeringId:'o5',expectedVersion:1})).rejects.toMatchObject({code:'RULE_VIOLATION'});
    snapshot.courses[5]!.prerequisiteCourseIds=['c8'];
    await expect(application.close.supplement(registrar,termId,{studentId:studentIds[6]!,offeringId:'o6',expectedVersion:1})).rejects.toMatchObject({code:'RULE_VIOLATION'});
    expect(await db.billingOutbox.count()).toBe(before+1);expect((await application.schedules.view(studentIds[6]!,termId)).registrations.map(r=>r.offeringId)).toEqual(['o1']);
  });
  it('AC37–44/52/53：跨角色路径均拒绝、停用撤销已有session、关闭历史保留', async () => {
    const student=await login('S000001');const teacher=await login('P000001');const admin=await login('registrar');
    for(const [auth,path] of [[student,`/api/professor/terms/${termId}/teaching`],[teacher,'/api/student/report-card'],[teacher,'/api/registrar/students'],[admin,`/api/professor/offerings/o1/roster`],[admin,'/api/student/report-card']] as const)expect((await req(path,'GET',undefined,auth)).status).toBe(403);
    const wrongOrigin=await application.app.request('http://localhost/api/auth/login',{method:'POST',headers:{Origin:'https://untrusted.test','content-type':'application/json'},body:JSON.stringify({account:'registrar',password})});expect(wrongOrigin.status).toBe(403);
    await register(0,['o1']);await application.people.update(registrar,'students',studentIds[0]!,{expectedVersion:1,patch:{accountEnabled:false}});
    expect((await req('/api/auth/me','GET',undefined,student)).status).toBe(401);expect(await db.registration.count({where:{studentId:studentIds[0]!,...activeRegistration}})).toBe(1);
    await application.people.update(registrar,'students',studentIds[0]!,{expectedVersion:2,patch:{accountEnabled:true}});
    await register(1,['o1']);await register(2,['o1']);await application.close.request(registrar,termId);await application.runtime.settle();
    const preview=await application.people.preview(registrar,'students',studentIds[0]!,{expectedVersion:3,patch:{status:'GRADUATED'}});
    expect(preview.impact.terms[0]!.retainedClosedRecords).toBe(true);
    await application.people.update(registrar,'students',studentIds[0]!,{expectedVersion:3,patch:{status:'GRADUATED'},confirmed:true,impactToken:preview.impact.impactToken});
    expect(await db.registration.count({where:{studentId:studentIds[0]!,state:'COMMITTED'}})).toBe(1);expect(await db.billingOutbox.count()).toBe(16);
  });
  it('AC35/36：实际HTTP已接收后断连、模拟/后端重启去重与新版本覆盖', async () => {
    const directory=await mkdtemp(join(tmpdir(),'wylie-api-http-'));const options={seedPath:join(directory,'seed.json'),statePath:join(directory,'state.json'),externalToken:randomToken(),controlToken:randomToken(),controlEnabled:true};
    await writeFile(options.seedPath,JSON.stringify({catalogs:[snapshot]}));
    let server=await startSimulatorServer(options,0);
    const stop=async()=>{if('closeAllConnections' in server)server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));};
    const transport=()=>{const address=server.address();if(!address||typeof address==='string')throw new Error('Missing listener');return {catalogBaseUrl:`http://127.0.0.1:${address.port}`,billingBaseUrl:`http://127.0.0.1:${address.port}`,externalToken:options.externalToken};};
    const control=async(path:string,body?:unknown)=>{const response=await fetch(new URL(path,transport().billingBaseUrl),{method:body?'PUT':'GET',headers:{authorization:`Bearer ${options.controlToken}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});expect(response.status).toBe(200);return response.json();};
    try{
      const httpApp=createApplication({db,config,external:httpExternal(transport()),clock:()=>now,log:()=>{}});await recover(httpApp);
      for(let i=0;i<9;i++)await register(i,['o1']);await httpApp.close.request(registrar,termId);await httpApp.runtime.settle();
      await control('/control/faults',{catalog:{mode:'normal',delayMs:0},billing:{mode:'drop-after-accept',delayMs:0}});
      await httpApp.billing.tick();expect(await db.billingOutbox.count({where:{status:'RETRY'}})).toBe(16);
      const path=`/control/bills?termId=${termId}&studentId=${studentIds[9]}`;const accepted=await control(path);expect(accepted).toMatchObject({latestVersion:1,latestAmountYuan:'0.00'});expect(accepted.acceptedBusinessIds).toHaveLength(1);
      now=new Date(now.getTime()+59999);await httpApp.billing.tick();expect((await db.billingOutbox.findFirstOrThrow()).attempts).toBe(1);
      await stop();server=await startSimulatorServer(options,0);
      const restarted=createApplication({db,config,external:httpExternal(transport()),clock:()=>now,log:()=>{}});await recover(restarted);
      const closedBefore=await db.term.findUniqueOrThrow({where:{id:termId}});expect(closedBefore.closeState).toBe('CLOSED');
      now=new Date(now.getTime()+1);await restarted.billing.tick();expect(await db.billingOutbox.count({where:{status:'ACKNOWLEDGED'}})).toBe(16);
      expect((await control(path)).acceptedBusinessIds).toHaveLength(1);expect((await db.term.findUniqueOrThrow({where:{id:termId}})).closeResult).toEqual(closedBefore.closeResult);
      const supplemented=await restarted.close.supplement(registrar,termId,{studentId:studentIds[9]!,offeringId:'o1',expectedVersion:0});expect(supplemented.billing.version).toBe(2);
      await restarted.billing.tick();expect(await control(path)).toMatchObject({latestVersion:2,latestAmountYuan:'154.31'});
      const old=await db.billingOutbox.findFirstOrThrow({where:{studentId:studentIds[9]!,version:1}});const ack=await restarted.runtime.external.bill(old.payload as unknown as BillingPayload);expect(ack).toMatchObject({outcome:'DUPLICATE',latestVersion:2});
      expect((await control(path)).latestAmountYuan).toBe('154.31');expect((await db.billingOutbox.findUniqueOrThrow({where:{id:old.id}})).status).toBe('SUPERSEDED');
    }finally{await stop();await rm(directory,{recursive:true,force:true});}
  });
  it('目录503不冒充空集合，真实空集合只由后台同步删除业务注册', async () => {
    await application.schedules.write(studentActors[0]!,termId,0,choices(),'SUBMIT');unavailable=true;
    await expect(application.catalog.view(termId)).rejects.toMatchObject({code:'CATALOG_UNAVAILABLE'});expect(await db.registration.count({where:activeRegistration})).toBe(4);
    unavailable=false;snapshot.offerings=[];snapshot.revision='2';await expect(application.catalog.view(termId)).rejects.toMatchObject({code:'CATALOG_CHANGED'});
    await application.catalog.fresh(termId);expect((await application.catalog.view(termId)).offerings).toEqual([]);expect(await db.registration.count({where:activeRegistration})).toBe(0);
  });
  it('慢计费不阻塞1秒目录后台轮询，HTTP发送并发不超过8', async () => {
    const blocked=barrier();let active=0;let maximum=0;let started=0;
    const slow:External={
      catalog:async id=>id===termId?structuredClone(snapshot):{...snapshot,termId:id,offerings:[]},
      bill:async payload=>{active++;started++;maximum=Math.max(maximum,active);try{await blocked.wait();return {businessId:payload.businessId,version:payload.version,outcome:'APPLIED',latestVersion:payload.version};}finally{active--;}}
    };
    const background=createApplication({db,config,external:slow,clock:()=>now,log:()=>{}});
    // Due outbox for a historical closed term; the current term remains editable.
    await db.term.update({where:{id:previousId},data:{closeState:'CLOSED',closedAt:now}});
    await background.runtime.transaction([previousId],async tx=>{const term=await tx.term.findUniqueOrThrow({where:{id:previousId}});for(const student of await tx.student.findMany())await background.billing.create(tx,student,term,[],null);});
    const stop=await startRuntime(background,url,()=>{});
    try{
      await expect.poll(()=>started,{timeout:3000}).toBe(8);expect(active).toBe(8);
      snapshot.revision='2';snapshot.offerings[0]!.meetings[0]!.startMinute=5;
      const changedAt=performance.now();
      await expect.poll(async()=>(await db.catalogSnapshot.findUniqueOrThrow({where:{termId}})).revision,{timeout:4000,interval:50}).toBe('2');
      expect(performance.now()-changedAt).toBeLessThan(5000);expect(active).toBe(8);expect(started).toBe(8);
    }finally{blocked.release();await stop();}
    expect(maximum).toBe(8);expect(started).toBe(16);expect(await db.billingOutbox.count({where:{status:'ACKNOWLEDGED'}})).toBe(16);
  });
  it('关闭gate已生效但intent未提交时删除无记录学生也被拒绝', async () => {
    const initial=barrier();hook=name=>name==='close.afterGate'?initial.wait():Promise.resolve();
    const closing=application.close.request(registrar,termId);await initial.reached;
    try{
      expect((await db.term.findUniqueOrThrow({where:{id:termId}})).closeState).toBe('OPEN');
      await expect(application.people.remove(registrar,'students',studentIds[15]!,1)).rejects.toMatchObject({code:'CLOSING'});
    }finally{initial.release();}
    await closing;await application.runtime.settle();expect((await db.term.findUniqueOrThrow({where:{id:termId}})).closeState).toBe('CLOSED');expect(await db.billingOutbox.count()).toBe(16);
  });
  it('AC03/14/16/21/24–27/61：目录字段/资格权威、人员CRUD与全角色SSN唯一', async () => {
    snapshot.offerings.push({...snapshot.offerings[0]!,id:'other-o1',meetings:[{...snapshot.offerings[0]!.meetings[0]!,startMinute:600,endMinute:650}]});snapshot.revision='2';await application.catalog.fresh(termId);
    const student=await login('S000001');const catalog=(await(await req(`/api/catalog?termId=${termId}`,'GET',undefined,student)).json()).data;dto.responseSchemas.catalog.parse(catalog);
    expect(catalog.offerings.filter((o:dto.Offering)=>o.courseId==='c1').map((o:dto.Offering)=>o.id)).toEqual(['o1','other-o1']);expect(catalog.offerings[0]).toMatchObject({department:'Testing',credits:'1.25',professor:{id:professorId},enrolledCount:0});expect(catalog.offerings.at(-1).professor).toBeNull();
    await db.qualification.delete({where:{professorId_courseId:{professorId:otherProfessorId,courseId:'c8'}}});const teacher=await login('P000002');
    expect((await(await req(`/api/catalog?termId=${termId}`,'GET',undefined,teacher)).json()).data.offerings.find((o:dto.Offering)=>o.id==='o8').eligibleToTeach).toBe(false);
    await expect(application.teaching.write(otherProfessor,termId,0,['o8'])).rejects.toMatchObject({code:'FORBIDDEN'});expect((await application.teaching.view(otherProfessorId,termId)).offeringIds).toEqual([]);
    expect((await(await req('/api/professor/grade-context','GET',undefined,teacher)).json()).data.offerings).toEqual([]);
    const input={name:'New professor',ssn:'900-00-0001',birthDate:'1970-01-01',status:'ACTIVE' as const,department:'Math',accountEnabled:true};
    const p=await application.people.create(registrar,'professors',input);const p2=await application.people.create(registrar,'professors',{...input,ssn:'900-00-0002'});expect(p.person.account).not.toBe(p2.person.account);
    const update=await application.people.update(registrar,'professors',p.person.id,{expectedVersion:1,patch:{name:'Renamed',ssn:'900-00-0003'}});expect(update.person).toMatchObject({name:'Renamed',account:p.person.account,ssnMasked:'***0003'});
    expect(await db.personIdentity.findUnique({where:{ssn:'900-00-0001'}})).toBeNull();expect((await db.personIdentity.findUniqueOrThrow({where:{ssn:'900-00-0003'}})).professorId).toBe(p.person.id);
    await expect(application.people.create(registrar,'students',{name:'Duplicate',ssn:'900-00-0003',birthDate:'2000-01-01',status:'ACTIVE',graduationDate:null,accountEnabled:true})).rejects.toMatchObject({code:'HAS_RECORDS'});
    await application.people.remove(registrar,'professors',p.person.id,2);await expect(application.people.find('professors',p.person.id)).rejects.toMatchObject({code:'NOT_FOUND'});
    await expect(application.people.remove(registrar,'professors',professorId,1)).rejects.toMatchObject({code:'HAS_RECORDS'});
  });
  it('AC12/47/56：初选前/空档/自然截止不写，初选及加退选可写，空主选拒绝', async () => {
    for(const instant of ['2026-09-30T23:59:59Z','2026-10-10T00:00:00Z']){now=new Date(instant);await expect(application.schedules.write(studentActors[0]!,termId,0,choices(),'SUBMIT')).rejects.toMatchObject({code:'PHASE_FORBIDDEN'});}
    now=new Date('2026-10-01T00:00:00Z');await application.schedules.write(studentActors[0]!,termId,0,choices(),'SUBMIT');
    await expect(application.schedules.write(studentActors[0]!,termId,1,choices([],[]),'SUBMIT')).rejects.toMatchObject({code:'RULE_VIOLATION'});
    now=new Date('2026-10-08T00:00:00Z');await application.schedules.write(studentActors[0]!,termId,1,choices(['o1','o2','o3'],[]),'SUBMIT');
    expect((await application.schedules.view(studentIds[0]!,termId)).registrations).toHaveLength(3);
    await db.term.update({where:{id:termId},data:{initialEndsAt:new Date('2026-10-06'),addDropStartsAt:new Date('2026-10-07')}});now=new Date('2026-10-06T12:00:00Z');
    await expect(application.schedules.write(studentActors[0]!,termId,2,choices(),'SAVE')).rejects.toMatchObject({code:'PHASE_FORBIDDEN'});
    expect((await application.schedules.view(studentIds[0]!,termId)).version).toBe(2);
    now=new Date('2026-10-10');await application.teaching.write(professor,termId,1,['o1']);expect((await application.teaching.view(professorId,termId)).offeringIds).toEqual(['o1']);
  });
  it('AC40/42：全部未授权角色写接口组合拒绝，审计记录结果而非提交密码', async () => {
    const users=[{role:'STUDENT',auth:await login('S000001')},{role:'PROFESSOR',auth:await login('P000001')},{role:'REGISTRAR',auth:await login('registrar')}];
    const endpoints=[['REGISTRAR','POST','/api/registrar/students'],['REGISTRAR','PATCH',`/api/registrar/professors/${professorId}`],['REGISTRAR','POST','/api/registrar/imports/students'],['REGISTRAR','PUT',`/api/registrar/terms/${termId}/windows`],['REGISTRAR','POST',`/api/registrar/terms/${termId}/close`],['REGISTRAR','POST',`/api/registrar/terms/${termId}/supplements`],['PROFESSOR','PATCH','/api/professor/offerings/o1/grades'],['PROFESSOR','PUT',`/api/professor/terms/${termId}/teaching`],['STUDENT','POST',`/api/student/terms/${termId}/schedule/submit`]];
    for(const [allowed,method,path] of endpoints)for(const user of users.filter(u=>u.role!==allowed)){const response=await req(path!,method!,{password,ssn:'000-00-0000'},user.auth);expect(response.status).toBe(403);expect((await response.json()).error.code).toBe('FORBIDDEN');}
    const events=await db.auditEvent.findMany({where:{result:'FAILED'}});expect(events).toHaveLength(endpoints.length*2);expect(events.every(e=>e.actorAccountId&&e.requestId&&e.errorCode==='FORBIDDEN')).toBe(true);expect(JSON.stringify(events)).not.toContain(password);expect(JSON.stringify(events)).not.toContain('000-00-0000');
  });
  it('单实例实际锁/第二实例拒绝，CLOSING启动恢复且新进程可以再次取得领导权', async () => {
    await db.term.update({where:{id:termId},data:{closeState:'CLOSING',closeAttemptId:randomUUID()}});await recover(application);expect((await db.term.findUniqueOrThrow({where:{id:termId}})).lastCloseError).toMatchObject({code:'RECOVERED_INTERRUPTED_CLOSE'});
    const stop=await startRuntime(application,url,()=>{});
    try {const second=createApplication({db,config,external,clock:()=>now,log:()=>{}});await expect(startRuntime(second,url,()=>{})).rejects.toThrow('Another API instance');}
    finally {await stop();}
    const next=createApplication({db,config,external,clock:()=>now,log:()=>{}});const stopNext=await startRuntime(next,url,()=>{});expect(next.runtime.ready).toBe(true);await stopNext();
  });
});
