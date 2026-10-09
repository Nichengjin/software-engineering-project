import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { Client } from 'pg';
import ExcelJS from 'exceljs';
import type { Choices, CloseResult } from '@wylie/contracts';
import { activeRegistration } from '../../apps/api/src/runtime/context.js';
import type { BillingPayload } from '../../apps/api/src/runtime/external.js';
import { barrier, choices, createFixture, type Fixture, type Auth } from './fixture.js';

describe('US-018 Agent 执行：独立数据、真实 PG15 与 HTTP 模拟', () => {
  let f: Fixture;
  beforeEach(async () => { f = await createFixture(); }, 60000);
  afterEach(async () => { await f?.dispose(); }, 60000);
  const student = (i = 0) => f.actor(f.students[i]!.accountId);
  const professor = (i = 0) => f.actor(f.professors[i]!.accountId);
  const registrar = () => f.actor(f.registrar.id);
  const write = (version: number, selected = choices(), mode: 'SAVE' | 'SUBMIT' | 'DELETE' = 'SUBMIT', i = 0) => f.application.schedules.write(student(i), f.ids.T2, version, selected, mode);
  const view = (i = 0) => f.application.schedules.view(f.students[i]!.id, f.ids.T2);
  async function result() { return (await f.db.term.findUniqueOrThrow({ where: { id: f.ids.T2 } })).closeResult as unknown as CloseResult; }
  async function fill(offeringId: string, n: number, offset = 10) {
    await f.db.registration.createMany({ data: f.students.slice(offset, offset + n).map(s => ({ studentId: s.id, offeringId, source: 'SUBMIT' as const })) });
  }
  async function snapshot() {
    return {
      schedules: await f.db.schedule.findMany({ orderBy: { id: 'asc' } }),
      registrations: await f.db.registration.findMany({ orderBy: { id: 'asc' } }),
      grades: await f.db.gradeRecord.findMany({ orderBy: { id: 'asc' } }),
      offerings: await f.db.offering.findMany({ orderBy: { externalOfferingId: 'asc' } }),
      bills: await f.db.billingOutbox.findMany({ orderBy: { id: 'asc' } }),
      terms: await f.db.term.findMany({ orderBy: { id: 'asc' } }),
      students: await f.db.student.findMany({ orderBy: { id: 'asc' } }),
      professors: await f.db.professor.findMany({ orderBy: { id: 'asc' } }),
      teaching: await f.db.teachingVersion.findMany({ orderBy: { professorId: 'asc' } }),
      teachingHistory: await f.db.teachingHistory.findMany({ orderBy: { id: 'asc' } }),
      courses: await f.db.courseMirror.findMany({ orderBy: { externalCourseId: 'asc' } }),
      catalogSnapshots: await f.db.catalogSnapshot.findMany({ orderBy: { termId: 'asc' } }),
      notices: await f.db.catalogNotice.findMany({ orderBy: { id: 'asc' } }),
      qualifications: await f.db.qualification.findMany({ orderBy: [{ professorId: 'asc' }, { courseId: 'asc' }] }),
    };
  }
  async function response(path: string, method: string, body: unknown, auth: Auth, status = 200) {
    const r = await f.request(path, method, body, auth); const payload = await r.json();
    expect(r.status, JSON.stringify(payload)).toBe(status);
    if (method !== 'GET') {
      const audit = await f.db.auditEvent.findMany({ where: { requestId: payload.requestId } });
      expect(audit.length, `AC-42 request audit: ${method} ${path}`).toBeGreaterThan(0);
      expect(audit.every(a => a.actorAccountId && a.at && a.objectId)).toBe(true);
      if (status >= 400) expect(audit.some(a => a.result === 'FAILED')).toBe(true);
    }
    return payload;
  }

  it('AC-01/02/37/38/39/40/41/43/44：真实身份、全部入口角色矩阵、伪造字段与账户状态', async () => {
    const identities = [await f.login('S101'), await f.login('P11'), await f.login('R01')];
    const sameName = await f.login('S205');
    const me1 = await response('/api/auth/me', 'GET', undefined, identities[0]!);
    const me2 = await response('/api/auth/me', 'GET', undefined, sameName);
    expect(me1.data.user.account).not.toBe(me2.data.user.account);
    for (const account of ['S101', 'absent']) expect((await f.request('/api/auth/login', 'POST', { account, password: 'wrong' })).status).toBe(401);
    const endpoints: [number, string, string][] = [
      [0, 'GET', `/api/student/terms/${f.ids.T2}/notices`],
      [0, 'GET', '/api/student/report-card'], [0, 'GET', `/api/student/terms/${f.ids.T2}/schedule`],
      [0, 'PUT', `/api/student/terms/${f.ids.T2}/schedule`], [0, 'POST', `/api/student/terms/${f.ids.T2}/schedule/submit`], [0, 'DELETE', `/api/student/terms/${f.ids.T2}/schedule`],
      [1, 'GET', `/api/professor/terms/${f.ids.T2}/teaching`], [1, 'PUT', `/api/professor/terms/${f.ids.T2}/teaching`], [1, 'GET', `/api/professor/terms/${f.ids.T2}/offerings`],
      [1, 'GET', '/api/professor/offerings/M1/roster'], [1, 'PATCH', '/api/professor/offerings/M1/grades'], [1, 'GET', '/api/professor/grade-context'],
      [2, 'GET', '/api/registrar/students'], [2, 'GET', '/api/registrar/professors'], [2, 'GET', `/api/registrar/students/${f.students[0]!.id}`], [2, 'GET', `/api/registrar/professors/${f.professors[0]!.id}`],
      [2, 'POST', '/api/registrar/students'], [2, 'POST', '/api/registrar/professors'], [2, 'POST', `/api/registrar/students/${f.students[0]!.id}/impact-preview`], [2, 'POST', `/api/registrar/professors/${f.professors[0]!.id}/impact-preview`],
      [2, 'PATCH', `/api/registrar/students/${f.students[0]!.id}`], [2, 'PATCH', `/api/registrar/professors/${f.professors[0]!.id}`], [2, 'DELETE', `/api/registrar/students/${f.students[0]!.id}`],
      [2, 'DELETE', `/api/registrar/professors/${f.professors[0]!.id}`], [2, 'POST', '/api/registrar/imports/students'], [2, 'POST', '/api/registrar/imports/professors'],
      [2, 'POST', '/api/registrar/imports/historical-grades'], [2, 'POST', '/api/registrar/imports/qualifications'],
      [2, 'PUT', `/api/registrar/terms/${f.ids.T2}/windows`], [2, 'POST', `/api/registrar/terms/${f.ids.T2}/close`], [2, 'GET', `/api/registrar/terms/${f.ids.T2}/close-result`],
      [2, 'GET', `/api/registrar/terms/${f.ids.T2}/billing`], [2, 'GET', `/api/registrar/terms/${f.ids.T2}/supplement-context?studentId=${f.students[0]!.id}`], [2, 'POST', `/api/registrar/terms/${f.ids.T2}/supplements`],
    ];
    const before = await snapshot();
    for (const path of ['/api/terms', `/api/catalog?termId=${f.ids.T2}`]) {
      for (const auth of [undefined, { cookie: 'sid=invalid', csrf: 'invalid' }]) expect((await f.request(path, 'GET', undefined, auth)).status).toBe(401);
      for (const auth of identities) expect((await f.request(path, 'GET', undefined, auth)).status).not.toBe(401);
    }
    for (const [allowed, method, path] of endpoints) {
      for (const auth of [undefined, { cookie: 'sid=invalid', csrf: 'invalid' }]) expect((await f.request(path, method, undefined, auth)).status).toBe(401);
      for (const [index, auth] of identities.entries()) if (index !== allowed) await response(path, method, undefined, auth, 403);
    }
    expect(await snapshot()).toEqual(before);
    await response(`/api/student/report-card?studentId=${f.students[1]!.id}`, 'GET', undefined, identities[0]!, 400);
    await response(`/api/student/terms/${f.ids.T2}/schedule`, 'PUT', { ...choices(), expectedVersion: 0, studentId: f.students[1]!.id, role: 'REGISTRAR' }, identities[0]!, 400);
    for (const [method, suffix, body] of [['GET', '', undefined], ['PUT', '', { ...choices(), expectedVersion: 0, studentId: f.students[0]!.id }], ['POST', '/submit', { ...choices(), expectedVersion: 0, studentId: f.students[0]!.id }], ['DELETE', '', { expectedVersion: 0, confirmed: true, studentId: f.students[0]!.id }]] as const) {
      const r = await f.request(`/api/student/terms/${f.ids.T2}/schedule${suffix}?studentId=${f.students[0]!.id}`, method, body, sameName);
      expect(r.status).toBe(400);
    }
    await response('/api/professor/offerings/M1/roster', 'GET', undefined, await f.login('P27'), 403);
    await response('/api/professor/offerings/M1/grades', 'PATCH', { professorId: f.professors[1]!.id, cells: [] }, identities[1]!, 400);
    await response(`/api/professor/terms/${f.ids.T2}/teaching`, 'PUT', { professorId: f.professors[1]!.id, expectedVersion: 0, offeringIds: [] }, identities[1]!, 400);
    await f.db.account.update({ where: { account: 'S660' }, data: { mustChangePassword: true } });
    const initial = await f.login('S660');
    for (const path of ['/api/terms', `/api/catalog?termId=${f.ids.T2}`, '/api/student/report-card']) await response(path, 'GET', undefined, initial, 403);
    const newPassword = randomUUID();
    await response('/api/auth/change-password', 'POST', { currentPassword: f.password, newPassword }, initial);
    expect((await f.request('/api/auth/login', 'POST', { account: 'S660', password: f.password })).status).toBe(401);
    await f.login('S660', newPassword);
    for (const [index, status] of [[2, 'SUSPENDED'], [3, 'GRADUATED']] as const) {
      await f.db.student.update({ where: { id: f.students[index]!.id }, data: { status } });
      const auth = await f.login(f.students[index]!.account);
      await response('/api/student/report-card', 'GET', undefined, auth);
      await response(`/api/catalog?termId=${f.ids.T2}`, 'GET', undefined, auth, 403);
      for (const method of ['PUT', 'POST', 'DELETE']) await response(`/api/student/terms/${f.ids.T2}/schedule${method === 'POST' ? '/submit' : ''}`, method, { ...choices(), expectedVersion: 0 }, auth, 403);
    }
    await f.db.professor.update({ where: { id: f.professors[2]!.id }, data: { status: 'DEPARTED' } });
    await f.db.account.update({ where: { account: 'S550' }, data: { enabled: false } });
    for (const account of ['P39', 'S550']) expect((await f.request('/api/auth/login', 'POST', { account, password: f.password })).status).toBe(401);
    const serialized = JSON.stringify({ logs: f.logs, audit: await f.db.auditEvent.findMany() });
    expect(serialized).not.toContain(f.password); expect(serialized).not.toContain(newPassword); expect(serialized).not.toContain('TEST-S-0');
  });

  it('AC-03/04：目录区分同课程班次、不同学期、故障/超时与空结果', async () => {
    await f.db.offering.update({ where: { externalOfferingId: 'M1b' }, data: { professorId: null } });
    const auth = await f.login('S101');
    const catalog = (await response(`/api/catalog?termId=${f.ids.T2}`, 'GET', undefined, auth)).data;
    expect(catalog.offerings.filter((o: { courseId: string }) => o.courseId === 'math')).toMatchObject([{ id: 'M1', credits: '3', professor: { name: '本地教授0' } }, { id: 'M1b', professor: null }]);
    const { revision: _revision, ...baseCatalog } = f.snapshot;
    const t3 = { ...baseCatalog, termId: f.ids.T3, offerings: [{ ...f.snapshot.offerings[0]!, id: 'T3M1', termId: f.ids.T3, meetings: [{ dayOfWeek: 1, startMinute: 480, endMinute: 540, fromDate: '2027-02-01', throughDate: '2027-07-01' }] }] };
    await f.control('catalog', t3); await f.application.catalog.fresh(f.ids.T3);
    expect((await response(`/api/catalog?termId=${f.ids.T3}`, 'GET', undefined, auth)).data.offerings.map((o: { id: string }) => o.id)).toEqual(['T3M1']);
    expect(catalog.offerings.map((o: { id: string }) => o.id)).not.toContain('T3M1');
    const before = await snapshot();
    for (const mode of ['unavailable', 'timeout']) {
      await f.control('faults', { catalog: { mode, delayMs: 0 }, billing: { mode: 'normal', delayMs: 0 } });
      const r = await response(`/api/catalog?termId=${f.ids.T2}`, 'GET', undefined, auth, 503);
      expect(r.error.code).toBe('CATALOG_UNAVAILABLE'); expect(await snapshot()).toEqual(before);
    }
    await f.control('faults', { catalog: { mode: 'normal', delayMs: 0 }, billing: { mode: 'normal', delayMs: 0 } });
    f.snapshot.offerings = []; await f.sync();
    expect((await response(`/api/catalog?termId=${f.ids.T2}`, 'GET', undefined, auth)).data.offerings).toEqual([]);
  }, 30000);

  it('AC-05/06/10/13/47/49/64：保存与注册分离、非对称人数、版本与首次时间', async () => {
    for (const [offering, n, offset] of [['M1', 2, 10], ['M2', 3, 20], ['M3', 8, 30], ['M4', 0, 40], ['B1', 1, 50], ['B2', 7, 60]] as const) await fill(offering, n, offset);
    await write(0, choices([], ['B1']), 'SAVE'); await write(1, choices([], []), 'SAVE');
    for (const selected of [choices(['M1', 'M2', 'M3']), choices(undefined, ['B1'])]) await expect(write(2, selected)).rejects.toMatchObject({ code: 'RULE_VIOLATION' });
    const submitted = await write(2); expect(submitted.schedule.firstSubmittedAt).toBe(f.clock.now.toISOString());
    expect(await Promise.all(['M1', 'M2', 'M3', 'M4', 'B1', 'B2'].map(async o => (await f.members(o)).length))).toEqual([3, 4, 9, 1, 1, 7]);
    for (const o of ['M1', 'M2', 'M3', 'M4']) expect(await f.members(o)).toContain('S101');
    await write(3, choices(['M1', 'B1'], ['B2', 'M1b']), 'SAVE');
    const saved = await view(); expect(saved.saved).toEqual(choices(['M1', 'B1'], ['B2', 'M1b']));
    expect(saved.registrations.map(r => r.offeringId).sort()).toEqual(['M1', 'M2', 'M3', 'M4']);
    for (const mode of ['SAVE', 'SUBMIT'] as const) await expect(write(3, choices(), mode)).rejects.toMatchObject({ code: 'STALE_VERSION' });
    for (const selected of [choices(['M1', 'M2', 'M3', 'M4', 'B1']), choices(undefined, ['B1', 'B2', 'E1'])]) await expect(write(4, selected, 'SAVE')).rejects.toMatchObject({ code: 'RULE_VIOLATION' });
    f.clock.now = new Date('2026-10-02T01:00:00Z');
    await write(4, choices(['M1', 'B1'], []));
    expect(await f.members('M2')).not.toContain('S101'); expect(await f.members('B1')).toEqual(['S101', 'S1050']);
    for (const version of [5, 6, 7]) await write(version, choices(['M1', 'B1'], []));
    expect((await view()).firstSubmittedAt).toBe(submitted.schedule.firstSubmittedAt);
    expect((await view()).registrations).toHaveLength(2);
    await expect(write(8, choices([], []))).rejects.toMatchObject({ code: 'RULE_VIOLATION' });
    await write(8, choices(['M1', 'M2', 'M3'], []));
    await write(9, choices(['M1'], ['B1', 'B2']));
    expect((await view()).registrations.map(r => r.offeringId)).toEqual(['M1']);
  });

  it.each(['F', 'I', null, 'C'] as const)('AC-07：先修 D＋%s，全部及格才允许；失败完全保留', async grade => {
    await write(0); f.snapshot.courses.find(c => c.id === 'advanced')!.prerequisiteCourseIds = ['math', 'programming']; await f.sync();
    await f.db.gradeRecord.create({ data: { studentId: f.students[0]!.id, termId: f.ids.T0, courseId: 'math', courseNameSnapshot: 'math', value: 'D', source: 'IMPORT' } });
    if (grade) await f.db.gradeRecord.create({ data: { studentId: f.students[0]!.id, termId: f.ids.T0, courseId: 'programming', courseNameSnapshot: 'programming', value: grade, source: 'IMPORT' } });
    const before = await snapshot(); const action = write(1, choices(['M1', 'M2', 'M3', 'A1'], []));
    if (grade === 'C') expect((await action).schedule.registrations.map(r => r.offeringId).sort()).toEqual(['A1', 'M1', 'M2', 'M3']);
    else { await expect(action).rejects.toMatchObject({ code: 'RULE_VIOLATION' }); expect(await snapshot()).toEqual(before); }
  });

  it.each(['full', 'conflict', 'same-course', 'cancelled', 'closed', 'full-and-conflict'] as const)('AC-07/10：非法主选 %s 不先退旧班', async reason => {
    await write(0); let candidate = 'B1';
    if (reason.includes('full')) await fill('B1', 10);
    if (reason.includes('conflict')) { candidate = reason === 'conflict' ? 'X2' : 'B1'; f.snapshot.offerings.find(o => o.id === candidate)!.meetings = f.snapshot.offerings[1]!.meetings; await f.sync(); }
    if (reason === 'same-course') candidate = 'M1b';
    if (reason === 'cancelled') await f.db.offering.update({ where: { externalOfferingId: 'B1' }, data: { status: 'CANCELLED' } });
    if (reason === 'closed') await f.db.offering.update({ where: { externalOfferingId: 'B1' }, data: { status: 'CLOSED' } });
    const before = await snapshot();
    const auth = await f.login('S101');
    const r = await f.request(`/api/student/terms/${f.ids.T2}/schedule/submit`, 'POST', { ...choices(['M1', 'M2', 'M3', candidate], []), expectedVersion: 1 }, auth);
    expect(r.ok).toBe(false); const body = await r.json();
    if (reason === 'full-and-conflict') expect(body.error.issues.map((i: { code: string }) => i.code)).toEqual(expect.arrayContaining(['OFFERING_FULL', 'TIME_CONFLICT']));
    expect(await snapshot()).toEqual(before);
  });

  it.each(['full', 'conflict', 'same-course', 'prerequisite', 'cancelled'] as const)('AC-48：备选 %s 与主选规则有区别', async reason => {
    let alternate = 'B1';
    if (reason === 'full') await fill('B1', 10);
    if (reason === 'conflict') alternate = 'X2';
    if (reason === 'same-course') alternate = 'M1b';
    if (reason === 'prerequisite') { f.snapshot.courses.find(c => c.id === 'programming')!.prerequisiteCourseIds = ['advanced']; await f.sync(); }
    if (reason === 'cancelled') await f.db.offering.update({ where: { externalOfferingId: 'B1' }, data: { status: 'CANCELLED' } });
    const before = await snapshot();
    if (reason === 'prerequisite' || reason === 'cancelled') { await expect(write(0, choices(undefined, [alternate, 'B2']))).rejects.toMatchObject({ code: 'RULE_VIOLATION' }); expect(await snapshot()).toEqual(before); }
    else { await write(0, choices(undefined, [alternate, 'B2'])); expect((await view()).registrations).toHaveLength(4); expect(await f.members(alternate)).not.toContain('S101'); }
  });

  it.each([0, 1])('AC-08：屏障先放行学生 %i 获末席，败者旧班保留', async first => {
    await fill('B1', 9); await f.register(0, ['M1']); await f.register(1, ['M2']);
    const gate = barrier(); let blocked = false;
    f.fault.handler = async name => { if (name === 'submit.beforeConfirm' && !blocked) { blocked = true; await gate.wait(); } };
    const winner = write(1, choices(['B1'], []), 'SUBMIT', first); await gate.reached;
    const loser = write(1, choices(['B1'], []), 'SUBMIT', 1 - first);
    const both = Promise.allSettled([winner, loser]); gate.release();
    const results = await both; expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
    expect((results[1] as PromiseRejectedResult).reason.code).toBe('OFFERING_FULL');
    expect(await f.members('B1')).toEqual([...f.students.slice(10, 19).map(s => s.account), f.students[first]!.account].sort());
    expect((await view(1 - first)).registrations.map(r => r.offeringId)).toEqual([first === 0 ? 'M2' : 'M1']);
  });

  it('AC-11/12/63：删除确认、历史保留、重建4+2及排序时间重置', async () => {
    await write(0); const first = (await view()).firstSubmittedAt;
    await f.db.gradeRecord.create({ data: { studentId: f.students[0]!.id, termId: f.ids.T1, courseId: 'math', courseNameSnapshot: 'math', value: 'D', source: 'PROFESSOR' } });
    const auth = await f.login('S101'); const before = await snapshot();
    await response(`/api/student/terms/${f.ids.T2}/schedule`, 'DELETE', { expectedVersion: 1, confirmed: false }, auth, 400);
    expect(await snapshot()).toEqual(before); await write(1, choices([], []), 'DELETE');
    expect(await view()).toMatchObject({ exists: false, firstSubmittedAt: null, registrations: [] });
    expect(await f.db.gradeRecord.count()).toBe(1);
    await expect(write(2, choices(['M1', 'M2', 'M3']))).rejects.toMatchObject({ code: 'RULE_VIOLATION' });
    f.clock.now = new Date('2026-10-01T00:00:00Z'); await write(2); expect((await view()).firstSubmittedAt).not.toBe(first);
    expect((await view()).firstSubmittedAt).toBe('2026-10-01T00:00:00.000Z');
    await write(3, choices(['M1', 'M2', 'M3'], ['B1']));
    await f.register(1, ['M1', 'M2', 'M3'], ['B1'], new Date('2026-09-30T01:00:00Z'));
    for (const o of ['M1', 'M2', 'M3']) await fill(o, 1); await fill('B1', 9, 20);
    await f.close(); expect((await result()).leveled).toEqual([{ studentId: f.students[1]!.id, offeringId: 'B1', alternateIndex: 0 }]);
  });

  it.each(['initial-before', 'gap', 'after-deadline', 'closing', 'closed'] as const)('AC-12：无课表与时间阶段 %s × SAVE/SUBMIT/DELETE', async phase => {
    const initialAuth = await f.login('S101');
    expect((await response(`/api/student/terms/${f.ids.T2}/schedule`, 'GET', undefined, initialAuth)).data.schedule).toMatchObject({ exists: false, registrations: [] });
    if (phase === 'initial-before') f.clock.now = new Date('2026-09-24T23:59:59.999Z');
    if (phase === 'gap') f.clock.now = new Date('2026-09-30T10:00:00Z');
    if (phase === 'after-deadline') f.clock.now = new Date('2026-10-05T10:00:00Z');
    if (phase === 'closing') { await f.db.term.update({ where: { id: f.ids.T2 }, data: { closeState: 'CLOSING' } }); f.application.runtime.gates.set(f.ids.T2, 'CLOSING'); }
    if (phase === 'closed') { await f.db.term.update({ where: { id: f.ids.T2 }, data: { closeState: 'CLOSED' } }); f.application.runtime.gates.set(f.ids.T2, 'CLOSED'); }
    const auth = await f.login('S101');
    const before = await snapshot();
    for (const [method, suffix, body] of [['PUT', '', { ...choices(), expectedVersion: 0 }], ['POST', '/submit', { ...choices(), expectedVersion: 0 }], ['DELETE', '', { expectedVersion: 0, confirmed: true }]] as const) {
      const r = await f.request(`/api/student/terms/${f.ids.T2}/schedule${suffix}`, method, body, auth);
      expect(r.status).toBe(409);
    }
    expect(await snapshot()).toEqual(before);
  });

  it.each([-1, 0, 1])('AC-50：自然截止偏移 %i 毫秒以确认时刻为准', async offset => {
    await write(0); const before = await snapshot();
    f.clock.now = new Date('2026-10-05T09:59:59Z');
    f.fault.handler = async name => { if (name === 'submit.beforeConfirm') f.clock.now = new Date(Date.parse('2026-10-05T10:00:00Z') + offset); };
    if (offset < 0) await write(1, choices(['M1'], []));
    else { await expect(write(1, choices(['M1'], []))).rejects.toMatchObject({ code: 'PHASE_FORBIDDEN' }); expect(await snapshot()).toEqual(before); }
  });

  it('AC-56：非法窗口及全部精确端点、空档、自然截止不自动关闭', async () => {
    const auth = await f.login('R01'); const term = await f.db.term.findUniqueOrThrow({ where: { id: f.ids.T2 } });
    const good = { expectedVersion: 1, teachingStartsAt: term.teachingStartsAt.toISOString(), initialStartsAt: term.initialStartsAt.toISOString(), initialEndsAt: term.initialEndsAt.toISOString(), addDropStartsAt: term.addDropStartsAt.toISOString(), addDropEndsAt: term.addDropEndsAt.toISOString() };
    for (const patch of [{ initialStartsAt: good.teachingStartsAt, teachingStartsAt: good.initialStartsAt }, { initialEndsAt: good.initialStartsAt }, { addDropStartsAt: good.initialStartsAt }, { addDropEndsAt: good.addDropStartsAt }]) await response(`/api/registrar/terms/${f.ids.T2}/windows`, 'PUT', { ...good, ...patch }, auth, 422);
    expect(await f.db.term.findUnique({ where: { id: f.ids.T2 } })).toEqual(term);
    const legal = { ...good, expectedVersion: 1, teachingStartsAt: '2026-09-19T23:00:00.000Z' };
    await response(`/api/registrar/terms/${f.ids.T2}/windows`, 'PUT', legal, auth);
    expect(await f.db.term.findUniqueOrThrow({ where: { id: f.ids.T2 } })).toMatchObject({ version: 2, teachingStartsAt: new Date(legal.teachingStartsAt) });
    let version = 0;
    for (const [instant, allowed] of [['2026-09-24T23:59:59.999Z', false], ['2026-09-25T00:00:00Z', true], ['2026-09-30T09:59:59.999Z', true], ['2026-09-30T10:00:00Z', false], ['2026-09-30T20:00:00Z', false], ['2026-10-01T00:00:00Z', true], ['2026-10-05T09:59:59.999Z', true], ['2026-10-05T10:00:00Z', false]] as const) {
      f.clock.now = new Date(instant);
      if (allowed) { await write(version, choices([], []), 'SAVE'); version++; }
      else await expect(write(version, choices([], []), 'SAVE')).rejects.toMatchObject({ code: 'PHASE_FORBIDDEN' });
    }
    expect((await f.db.term.findUniqueOrThrow({ where: { id: f.ids.T2 } })).closeState).toBe('OPEN');
    f.clock.now = new Date('2026-09-19T22:59:59.999Z'); await expect(f.application.teaching.write(professor(1), f.ids.T2, 0, [])).rejects.toMatchObject({ code: 'PHASE_FORBIDDEN' });
    f.clock.now = new Date('2026-09-19T23:00:00Z'); await f.application.teaching.write(professor(1), f.ids.T2, 0, []);
    f.clock.now = new Date('2026-10-05T10:00:00Z'); await f.application.teaching.write(professor(1), f.ids.T2, 1, []);
    await f.db.term.update({ where: { id: f.ids.T2 }, data: { closeState: 'CLOSED' } }); f.application.runtime.gates.set(f.ids.T2, 'CLOSED');
    await response(`/api/registrar/terms/${f.ids.T2}/windows`, 'PUT', { ...legal, expectedVersion: 2 }, await f.login('R01'), 409);
  });

  it('AC-15/52/53：写入中途PG触发器失败，授课/人员状态及关联清理整体回滚', async () => {
    await write(0);
    await f.db.$executeRawUnsafe(`CREATE FUNCTION acceptance_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'acceptance injected failure'; END $$`);
    for (const [kind, table, id, status] of [['students', 'Student', f.students[0]!.id, 'SUSPENDED'], ['professors', 'Professor', f.professors[0]!.id, 'DEPARTED']] as const) {
      const before = await snapshot(); const person = await f.application.people.find(kind, id);
      const input = status === 'SUSPENDED' ? { expectedVersion: 1, patch: { status: 'SUSPENDED' as const } } : { expectedVersion: 1, patch: { status: 'DEPARTED' as const } };
      const preview = await f.application.people.preview(registrar(), kind, id, input);
      await f.db.$executeRawUnsafe(`CREATE TRIGGER acceptance_failure BEFORE UPDATE ON "${table}" FOR EACH ROW EXECUTE FUNCTION acceptance_fail()`);
      try { await expect(f.application.people.update(registrar(), kind, id, { ...input, confirmed: true, impactToken: preview.impact.impactToken })).rejects.toThrow(); }
      finally { await f.db.$executeRawUnsafe(`DROP TRIGGER acceptance_failure ON "${table}"`); }
      expect(await snapshot()).toEqual(before); expect(await f.application.people.find(kind, id)).toEqual(person);
    }
    const before = await snapshot();
    await f.db.$executeRawUnsafe('CREATE TRIGGER acceptance_failure BEFORE INSERT OR UPDATE ON "TeachingVersion" FOR EACH ROW EXECUTE FUNCTION acceptance_fail()');
    try { await expect(f.application.teaching.write(professor(), f.ids.T2, 0, ['M1'])).rejects.toThrow(); }
    finally { await f.db.$executeRawUnsafe('DROP TRIGGER acceptance_failure ON "TeachingVersion"'); }
    expect(await snapshot()).toEqual(before);
  });

  it.each([0, 1])('AC-51：真实PG授课写屏障，教授 %i 先确认，另一人整份保留', async first => {
    await f.db.offering.updateMany({ data: { professorId: null } });
    await f.application.teaching.write(professor(), f.ids.T2, 0, ['M2']);
    await f.application.teaching.write(professor(1), f.ids.T2, 0, ['M3']);
    const lock = new Client({ connectionString: f.url }); await lock.connect();
    await lock.query('SELECT pg_advisory_lock(718018)');
    await f.db.$executeRawUnsafe(`CREATE FUNCTION acceptance_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."externalOfferingId" = 'M1' THEN PERFORM pg_advisory_xact_lock(718018); END IF; RETURN NEW; END $$`);
    await f.db.$executeRawUnsafe('CREATE TRIGGER acceptance_pause BEFORE UPDATE ON "Offering" FOR EACH ROW EXECUTE FUNCTION acceptance_pause()');
    const winner = f.application.teaching.write(professor(first), f.ids.T2, 1, ['M1', first ? 'M3' : 'M2']);
    try {
      await expect.poll(async () => Number((await lock.query('SELECT count(*) FROM pg_locks WHERE locktype=\'advisory\' AND objid=718018 AND NOT granted')).rows[0].count)).toBe(1);
      const loser = f.application.teaching.write(professor(1 - first), f.ids.T2, 1, ['M1']);
      const outcomes = Promise.allSettled([winner, loser]); await lock.query('SELECT pg_advisory_unlock(718018)');
      expect((await outcomes).map(r => r.status)).toEqual(['fulfilled', 'rejected']);
      expect((await f.application.teaching.view(f.professors[1 - first]!.id, f.ids.T2)).offeringIds).toEqual([first ? 'M2' : 'M3']);
      expect((await f.db.offering.findUniqueOrThrow({ where: { externalOfferingId: 'M1' } })).professorId).toBe(f.professors[first]!.id);
    } finally { await lock.query('SELECT pg_advisory_unlock_all()'); await winner.catch(() => {}); await lock.end(); }
  });

  it('AC-28/33/55：关闭等在途确认、拒绝新写，中途失败保留在途结果再成功重试', async () => {
    for (const o of ['M1', 'M2', 'M3']) await fill(o, 2); await fill('B1', 2, 20);
    await f.db.offering.update({ where: { externalOfferingId: 'M4' }, data: { professorId: null } });
    const gate = barrier(); const closeBaselineGate = barrier();
    f.fault.handler = async name => { if (name === 'submit.beforeConfirm') await gate.wait(); if (name === 'close.afterDrain') await closeBaselineGate.wait(); if (name === 'close.afterLeveling') throw new Error('after actual leveling'); };
    const inFlight = write(0); await gate.reached;
    await f.application.close.request(registrar(), f.ids.T2);
    for (const mode of ['SAVE', 'SUBMIT'] as const) await expect(write(0, choices(), mode, 1)).rejects.toMatchObject({ code: 'CLOSING' });
    await expect(f.application.teaching.write(professor(1), f.ids.T2, 0, [])).rejects.toMatchObject({ code: 'CLOSING' });
    await expect(f.application.close.request(registrar(), f.ids.T2)).rejects.toMatchObject({ code: 'CLOSING' });
    gate.release(); await inFlight; await closeBaselineGate.reached;
    const baseline = await snapshot(); closeBaselineGate.release(); await f.application.runtime.settle();
    expect((await view()).registrations.map(r => r.offeringId).sort()).toEqual(['M1', 'M2', 'M3', 'M4']);
    expect(await f.members('B1')).toEqual(['S1020', 'S1021']); expect(await f.db.billingOutbox.count()).toBe(0);
    expect((await f.db.term.findUniqueOrThrow({ where: { id: f.ids.T2 } })).closeState).toBe('OPEN');
    const recovered = await snapshot();
    expect({ ...recovered, terms: [] }).toEqual({ ...baseline, terms: [] });
    expect(recovered.terms.filter(t => t.id !== f.ids.T2)).toEqual(baseline.terms.filter(t => t.id !== f.ids.T2));
    f.fault.handler = undefined; f.clock.now = new Date('2026-10-05T10:00:00.001Z');
    await expect(write(1)).rejects.toMatchObject({ code: 'PHASE_FORBIDDEN' });
    await f.close(); expect((await view()).registrations.map(r => r.offeringId).sort()).toEqual(['B1', 'M1', 'M2', 'M3']);
    const before = await snapshot(); await expect(f.application.close.request(registrar(), f.ids.T2)).rejects.toMatchObject({ code: 'ALREADY_CLOSED' }); expect(await snapshot()).toEqual(before);
  });

  it('AC-29：0/1/2人取消，3/9/10人保留，无教授10人仍取消', async () => {
    for (const [o, n, offset] of [['M1', 0, 10], ['M2', 1, 11], ['M3', 2, 12], ['M4', 3, 20], ['B1', 9, 30], ['B2', 10, 40], ['E1', 10, 50]] as const) await fill(o, n, offset);
    await f.db.offering.update({ where: { externalOfferingId: 'E1' }, data: { professorId: null } });
    await f.close();
    for (const o of ['M1', 'M2', 'M3', 'E1']) { expect(await f.members(o)).toEqual([]); expect((await result()).cancelledOfferings.map(c => c.offeringId)).toContain(o); }
    expect(await Promise.all(['M4', 'B1', 'B2'].map(async o => (await f.members(o)).length))).toEqual([3, 9, 10]);
  });

  it.each(['cancelled', 'no-professor', 'full', 'conflict', 'prerequisite', 'same-course', 'both-invalid', 'both-valid', 'two-missing'] as const)('AC-30/31：按序调剂 %s，2→3班不提前取消', async reason => {
    const kept = reason === 'two-missing' ? ['M1', 'M2'] : ['M1', 'M2', 'M3'];
    for (const o of kept) await fill(o, 2);
    await fill('B1', 2, 20); await fill('B2', reason === 'full' ? 10 : 3, 30);
    let first = 'B2';
    if (reason === 'cancelled' || reason === 'both-invalid') await f.db.offering.update({ where: { externalOfferingId: 'B2' }, data: { status: 'CANCELLED' } });
    if (reason === 'both-invalid') await f.db.offering.update({ where: { externalOfferingId: 'B1' }, data: { professorId: null } });
    if (reason === 'no-professor') await f.db.offering.update({ where: { externalOfferingId: 'B2' }, data: { professorId: null } });
    if (reason === 'conflict') first = 'X2';
    if (reason === 'same-course') first = 'M1b';
    if (reason === 'prerequisite') { f.snapshot.courses.find(c => c.id === 'economics')!.prerequisiteCourseIds = ['advanced']; await f.sync(); }
    await f.register(0, kept, [first, 'B1']); await f.close();
    const leveled = (await result()).leveled.filter(r => r.studentId === f.students[0]!.id).map(r => [r.offeringId, r.alternateIndex]);
    expect(leveled).toEqual(reason === 'both-invalid' ? [] : reason === 'both-valid' ? [['B2', 0]] : reason === 'two-missing' ? [['B2', 0], ['B1', 1]] : [['B1', 1]]);
    if (!['both-valid', 'both-invalid'].includes(reason)) expect(await f.members('B1')).toEqual(['S101', 'S1020', 'S1021']);
  });

  it.each(['earlier', 'tie', 'no-second-round'] as const)('AC-32：排序及不二次调剂 %s', async mode => {
    for (const o of ['M1', 'M2', 'M3']) await fill(o, 3, 10);
    await fill('B1', mode === 'no-second-round' ? 1 : 9, 20); await fill('B2', 3, 40);
    await f.register(0, ['M1', 'M2', 'M3'], ['B1', 'B2']);
    if (mode !== 'no-second-round') await f.register(1, ['M1', 'M2', 'M3'], ['B1'], new Date(f.clock.now.getTime() - (mode === 'earlier' ? 1 : 0)));
    await f.close(); const r = await result();
    if (mode === 'no-second-round') { expect((await view()).registrations).toHaveLength(3); expect(await f.members('B2')).not.toContain('S101'); }
    else expect(r.leveled.find(x => x.offeringId === 'B1')?.studentId).toBe(f.students[mode === 'earlier' ? 1 : 0]!.id);
  });

  it('AC-34/54/57：保存不出账，1250/1125/1750及0元；旧账晚到不累加', async () => {
    for (const o of ['M1', 'M2', 'M3', 'M4']) await fill(o, 3);
    await fill('B1', 9, 20);
    await f.register(0, ['M1', 'M2', 'M3']); await f.register(1, ['M1', 'M2', 'M3', 'M4']);
    await write(1, choices(['M1', 'M2', 'M3', 'B1'], []), 'SAVE', 1);
    await write(0, choices(['B1'], []), 'SAVE', 2); await f.close();
    const old = await f.db.billingOutbox.findFirstOrThrow({ where: { studentId: f.students[0]!.id } });
    expect(old.amountYuan.toFixed(2)).toBe('1125.00');
    expect(old.payload).toEqual({ businessId: old.businessId, studentId: f.students[0]!.id, studentNumber: 'S101', studentName: '同名测试学生', termId: f.ids.T2, version: 1, closedAt: f.clock.now.toISOString(), offerings: [{ offeringId: 'M1', courseId: 'math', courseName: 'math', credits: '3' }, { offeringId: 'M2', courseId: 'physics', courseName: 'physics', credits: '2' }, { offeringId: 'M3', courseId: 'chemistry', courseName: 'chemistry', credits: '4' }], totalCredits: '9.00', pricePerCreditYuan: '125.00', amountYuan: '1125.00' });
    const full = await f.db.billingOutbox.findFirstOrThrow({ where: { studentId: f.students[1]!.id } }); expect(full.amountYuan.toFixed(2)).toBe('1250.00');
    const zero = await f.db.billingOutbox.findFirstOrThrow({ where: { studentId: f.students[2]!.id } }); expect(zero.amountYuan.toFixed(2)).toBe('0.00');
    expect(zero.payload).toEqual({ businessId: zero.businessId, studentId: f.students[2]!.id, studentNumber: 'S310', studentName: '虚构学生2', termId: f.ids.T2, version: 1, closedAt: f.clock.now.toISOString(), offerings: [], totalCredits: '0.00', pricePerCreditYuan: '125.00', amountYuan: '0.00' });
    expect(JSON.stringify(zero.payload)).not.toContain('grade');
    await f.application.close.supplement(registrar(), f.ids.T2, { studentId: f.students[0]!.id, offeringId: 'B1', expectedVersion: 2 });
    await f.application.billing.tick(); await f.application.billing.tick();
    const ack = await f.application.runtime.external.bill(old.payload as unknown as BillingPayload);
    expect(ack.latestVersion).toBe(2);
    const bill = await f.control(`bills?termId=${f.ids.T2}&studentId=${f.students[0]!.id}`);
    expect(bill).toMatchObject({ latestVersion: 2, latestAmountYuan: '1750.00' });
    expect(await f.members('B1')).toHaveLength(10);
    expect((await f.db.billingOutbox.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('SUPERSEDED');
  });

  it('BUG-001：计费送达列表返回账单中的学号和姓名，教务可按学号识别学生', async () => {
    await f.register(0, ['M1']); await f.register(2, ['M2']); await f.close();
    const response = await f.request(`/api/registrar/terms/${f.ids.T2}/billing`, 'GET', undefined, await f.login('R01'));
    expect(response.status).toBe(200);
    const items = (await response.json()).data.items as { studentId: string; studentNumber: string; studentName: string }[];
    expect(items.find(b => b.studentId === f.students[0]!.id)).toMatchObject({ studentNumber: 'S101', studentName: '同名测试学生' });
    expect(items.find(b => b.studentId === f.students[2]!.id)).toMatchObject({ studentNumber: 'S310', studentName: '虚构学生2' });
  });

  it.each(['two-students', 'same-student'] as const)('AC-57：补选并发 %s 不超容量或4门，外部故障持久待发', async mode => {
    for (const o of ['M1', 'M2', 'M3']) await fill(o, 3);
    await fill('B1', mode === 'two-students' ? 9 : 3, 20); await fill('B2', 3, 40);
    await f.register(0, ['M1', 'M2', 'M3']); await f.register(1, ['M1', 'M2', 'M3']); await f.close();
    await f.control('faults', { catalog: { mode: 'normal', delayMs: 0 }, billing: { mode: 'unavailable', delayMs: 0 } });
    const results = await Promise.allSettled([
      f.application.close.supplement(registrar(), f.ids.T2, { studentId: f.students[0]!.id, offeringId: 'B1', expectedVersion: 2 }),
      f.application.close.supplement(registrar(), f.ids.T2, { studentId: f.students[mode === 'two-students' ? 1 : 0]!.id, offeringId: mode === 'two-students' ? 'B1' : 'B2', expectedVersion: 2 }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await f.db.billingOutbox.count({ where: { version: 2 } })).toBe(1);
    expect((await view()).registrations.length).toBeLessThanOrEqual(4); expect((await view(1)).registrations.length).toBeLessThanOrEqual(4);
    if (mode === 'two-students') expect(await f.members('B1')).toHaveLength(10);
    // There are 80 accounts and each tick claims at most 50 due rows.
    await f.application.billing.tick(); await f.application.billing.tick();
    expect(await f.db.billingOutbox.count({ where: { version: 2, status: 'RETRY' } })).toBe(1);
  });

  it('AC-35/36：真实API进程退出重启、60秒重试、接收后断连与零元账幂等', async () => {
    await f.close(); f.clock.real = true;
    await f.control('faults', { catalog: { mode: 'normal', delayMs: 0 }, billing: { mode: 'drop-after-accept', delayMs: 0 } });
    // Restrict to one batch so every row's retry deadline can be observed precisely.
    await f.db.billingOutbox.updateMany({ where: { studentId: { not: f.students[0]!.id } }, data: { nextAttemptAt: new Date(Date.now() + 3600000) } });
    const portProbe = createServer();
    await new Promise<void>(resolve => portProbe.listen(0, '127.0.0.1', resolve));
    const address = portProbe.address(); if (!address || typeof address === 'string') throw new Error('No test port');
    await new Promise<void>(resolve => portProbe.close(() => resolve()));
    const origin = `http://127.0.0.1:${address.port}`;
    const launch = async () => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/server.ts'], { env: {
        ...process.env, NODE_ENV: 'test', DATABASE_URL: f.url, API_PORT: String(address.port), PUBLIC_ORIGIN: origin,
        CATALOG_BASE_URL: f.simulatorUrl, BILLING_BASE_URL: f.simulatorUrl, EXTERNAL_SERVICE_TOKEN: f.options.externalToken,
        CSRF_SIGNING_KEY: f.config.csrfSigningKey, IMPACT_SIGNING_KEY: f.config.impactSigningKey, PRICE_PER_CREDIT_YUAN: '125.00',
      }, stdio: 'pipe' });
      // Drain but do not publish raw child output or credentials.
      child.stdout.resume(); child.stderr.resume();
      const exit = new Promise<void>(resolve => child.once('exit', () => resolve()));
      const stop = async () => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
        await exit; clearTimeout(timer);
      };
      try {
        await expect.poll(async () => {
          if (child.exitCode !== null) throw new Error(`API child exited: ${child.exitCode}`);
          return fetch(`${origin}/api/health/ready`).then(r => r.ok).catch(() => false);
        }, { timeout: 10000, interval: 100 }).toBe(true);
        return { pid: child.pid, stop };
      } catch (error) { await stop(); throw error; }
    };
    let processHandle = await launch();
    try {
      await expect.poll(async () => (await f.db.billingOutbox.findFirstOrThrow({ where: { studentId: f.students[0]!.id } })).status, { timeout: 5000 }).toBe('RETRY');
      const failed = await f.db.billingOutbox.findFirstOrThrow({ where: { studentId: f.students[0]!.id } });
      expect(failed.attempts).toBe(1);
      const path = `bills?termId=${f.ids.T2}&studentId=${f.students[0]!.id}`;
      expect(await f.control(path)).toMatchObject({ latestAmountYuan: '0.00', acceptedBusinessIds: [failed.businessId] });
      // Readiness precedes initial background catalog polling. Freeze the restart
      // baseline only after all four fixture terms have their first snapshot.
      await expect.poll(async () => (await f.db.catalogSnapshot.findMany({ select: { termId: true } })).map(row => row.termId).sort(), { timeout: 5000 }).toEqual(Object.values(f.ids).sort());
      const before = await snapshot(); const firstPid = processHandle.pid;
      await processHandle.stop();
      processHandle = await launch(); expect(processHandle.pid).not.toBe(firstPid);
      expect(await snapshot()).toEqual(before);
      await f.control('faults', { catalog: { mode: 'normal', delayMs: 0 }, billing: { mode: 'normal', delayMs: 0 } });
      await new Promise(resolve => setTimeout(resolve, Math.max(0, failed.nextAttemptAt.getTime() - Date.now() - 1000)));
      expect((await f.db.billingOutbox.findUniqueOrThrow({ where: { id: failed.id } })).attempts).toBe(1);
      await expect.poll(async () => (await f.db.billingOutbox.findUniqueOrThrow({ where: { id: failed.id } })).status, { timeout: 5000, interval: 50 }).toBe('ACKNOWLEDGED');
      const sent = await f.db.billingOutbox.findUniqueOrThrow({ where: { id: failed.id } });
      expect(sent.attempts).toBe(2); expect(sent.acknowledgedAt!.getTime()).toBeGreaterThanOrEqual(failed.nextAttemptAt.getTime());
      expect(await f.control(path)).toMatchObject({ latestVersion: 1, latestAmountYuan: '0.00', acceptedBusinessIds: [failed.businessId] });
    } finally { await processHandle.stop(); }
  }, 90000);

  it('AC-45/46：目录改时间/先修不退课，删除清保存与提交，关闭不复活', async () => {
    await write(0); await write(0, choices(['M2'], []), 'SAVE', 1); await write(0, choices(['M1'], ['M2']), 'SAVE', 2);
    f.snapshot.offerings[0]!.meetings = f.snapshot.offerings[1]!.meetings; await f.sync();
    expect((await view()).registrations).toHaveLength(4);
    expect(await f.db.catalogNotice.count({ where: { studentId: f.students[0]!.id, kind: 'TIME_CONFLICT', resolved: false } })).toBe(1);
    await expect(write(1)).rejects.toMatchObject({ code: 'RULE_VIOLATION' });
    f.snapshot.offerings[0]!.meetings = [{ ...f.snapshot.offerings[1]!.meetings[0]!, dayOfWeek: 1 }];
    f.snapshot.courses[0]!.prerequisiteCourseIds = ['advanced']; await f.sync();
    expect((await view()).registrations).toHaveLength(4);
    expect(await f.db.catalogNotice.count({ where: { studentId: f.students[0]!.id, kind: 'PREREQUISITE', resolved: false } })).toBe(1);
    f.snapshot.offerings = f.snapshot.offerings.filter(o => o.id !== 'M2'); await f.sync();
    expect(await f.members('M2')).toEqual([]);
    for (const i of [0, 1, 2]) { const s = (await view(i)).saved as Choices; expect(s.primaryOfferingIds).not.toContain('M2'); expect(s.alternateOfferingIds).not.toContain('M2'); }
    const raw = await f.db.schedule.findMany(); expect(raw.every(s => !JSON.stringify(s.submittedChoices).includes('M2'))).toBe(true);
    for (const o of ['M1', 'M3', 'M4']) await fill(o, 2);
    await f.close(); expect(await f.members('M2')).toEqual([]); expect((await result()).unresolved.some(r => r.studentId === f.students[0]!.id)).toBe(true);
  });

  it.each(['TIME_CONFLICT', 'PREREQUISITE'] as const)('AC-45：独立复位目录变更 %s，再提交拒绝且关闭保留 unresolved', async kind => {
    await write(0);
    if (kind === 'TIME_CONFLICT') f.snapshot.offerings[0]!.meetings = structuredClone(f.snapshot.offerings[1]!.meetings);
    else f.snapshot.courses[0]!.prerequisiteCourseIds = ['advanced'];
    await f.sync();
    expect((await view()).registrations.map(r => r.offeringId).sort()).toEqual(['M1', 'M2', 'M3', 'M4']);
    expect(await f.db.catalogNotice.count({ where: { studentId: f.students[0]!.id, kind, resolved: false } })).toBe(1);
    await expect(write(1)).rejects.toMatchObject({ code: 'RULE_VIOLATION' });
    for (const o of ['M1', 'M2', 'M3', 'M4']) await fill(o, 2);
    await f.close();
    expect((await result()).unresolved).toEqual(expect.arrayContaining([expect.objectContaining({ studentId: f.students[0]!.id })]));
  });

  it('AC-19/20/21/22/23：十人格逐格结果、历史学期与所有权', async () => {
    const history = { ...f.snapshot, termId: f.ids.T1, offerings: f.snapshot.offerings.slice(0, 2).map((o, i) => ({ ...o, id: `H${i + 1}`, termId: f.ids.T1 })) };
    await f.application.catalog.apply(history);
    await f.db.offering.updateMany({ where: { termId: f.ids.T1 }, data: { professorId: f.professors[0]!.id } });
    await f.db.registration.createMany({ data: f.students.slice(0, 10).map(s => ({ studentId: s.id, offeringId: 'H1', source: 'SUBMIT' as const, state: 'COMMITTED' as const })) });
    await f.application.teaching.saveGrades(professor(), 'H1', [{ studentId: f.students[0]!.id, grade: 'B' }, { studentId: f.students[1]!.id, grade: 'C' }]);
    const auth = await f.login('P11');
    const grades = ['', 'Z', 'A', 'B', 'C', 'D', 'F', 'I', 'D', 'I'];
    const saved = await response('/api/professor/offerings/H1/grades', 'PATCH', { cells: grades.map((grade, i) => ({ studentId: f.students[i]!.id, grade })) }, auth);
    expect(saved.data.results.map((r: { outcome: string }) => r.outcome)).toEqual(['UNCHANGED', 'REJECTED', 'SAVED', 'SAVED', 'SAVED', 'SAVED', 'SAVED', 'SAVED', 'SAVED', 'SAVED']);
    expect(saved.data.results.map((r: { grade: string }) => r.grade)).toEqual(['B', 'C', 'A', 'B', 'C', 'D', 'F', 'I', 'D', 'I']);
    const before = await snapshot();
    await response('/api/professor/offerings/H1/grades', 'PATCH', { cells: [{ studentId: f.students[0]!.id, grade: 'D' }, { studentId: f.students[11]!.id, grade: 'A' }] }, auth, 403);
    await response('/api/professor/offerings/H1/grades', 'PATCH', { cells: [{ studentId: f.students[0]!.id, grade: 'A' }] }, await f.login('P27'), 403);
    await response('/api/professor/offerings/M1/grades', 'PATCH', { cells: [] }, auth, 403); expect(await snapshot()).toEqual(before);
    expect((await response('/api/professor/grade-context', 'GET', undefined, await f.login('P27'))).data.offerings).toEqual([]);
    await f.application.teaching.saveGrades(professor(), 'H1', [{ studentId: f.students[0]!.id, grade: 'D' }]);
    await expect(f.application.teaching.saveGrades(professor(), 'M1', [{ studentId: f.students[0]!.id, grade: 'A' }])).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const preLaunch = { ...f.snapshot, termId: f.ids.T0, offerings: [{ ...f.snapshot.offerings[0]!, id: 'T0H1', termId: f.ids.T0 }] };
    await f.application.catalog.apply(preLaunch); await f.db.offering.update({ where: { externalOfferingId: 'T0H1' }, data: { professorId: f.professors[0]!.id } });
    await f.db.registration.create({ data: { studentId: f.students[0]!.id, offeringId: 'T0H1', source: 'SUBMIT', state: 'COMMITTED' } });
    await expect(f.application.teaching.saveGrades(professor(), 'T0H1', [{ studentId: f.students[0]!.id, grade: 'A' }])).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await f.db.gradeRecord.createMany({ data: [{ studentId: f.students[0]!.id, termId: f.ids.T0, courseId: 'physics', courseNameSnapshot: 'physics', value: 'A', source: 'IMPORT' }, { studentId: f.students[0]!.id, termId: f.ids.T1, courseId: 'physics', courseNameSnapshot: 'physics', offeringId: 'H2', value: 'I', source: 'PROFESSOR' }, { studentId: f.students[1]!.id, termId: f.ids.T1, courseId: 'physics', courseNameSnapshot: 'physics', offeringId: 'H2', value: 'F', source: 'PROFESSOR' }, { studentId: f.students[1]!.id, termId: f.ids.T0, courseId: 'art', courseNameSnapshot: 'art', value: 'B', source: 'IMPORT' }] });
    const report = await response('/api/student/report-card', 'GET', undefined, await f.login('S101'));
    expect(report.data.term.id).toBe(f.ids.T1); expect(report.data.rows.map((r: { offeringId: string; grade: string }) => [r.offeringId, r.grade]).sort()).toEqual([['H1', 'D'], ['H2', 'I']]);
    expect(report.data.rows).not.toEqual(expect.arrayContaining([{ grade: 'A' }, { grade: 'F' }]));
    expect((await response('/api/student/report-card', 'GET', undefined, await f.login('S205'))).data.rows).toEqual(expect.arrayContaining([expect.objectContaining({ offeringId: 'H2', grade: 'F' })]));
    expect((await response('/api/student/report-card', 'GET', undefined, await f.login(f.students[11]!.account))).data.rows).toEqual([]);
  });

  it.each(['students', 'professors'] as const)('AC-24/25/26/27/59：%s 同名CRUD、真实xlsx逐行3新/1重/1坏', async kind => {
    const admin = await f.login('R01');
    const input = { name: '同名导入', birthDate: '2005-01-01', ssn: 'TEST-NEW-A', status: 'ACTIVE', accountEnabled: true, ...(kind === 'students' ? { graduationDate: null } : { department: '数学' }) };
    const created = (await response(`/api/registrar/${kind}`, 'POST', input, admin, 201)).data;
    const second = (await response(`/api/registrar/${kind}`, 'POST', { ...input, ssn: 'TEST-NEW-B' }, admin, 201)).data;
    expect(created.person.account).not.toBe(second.person.account); expect(created.initialCredential.initialPassword).not.toBe(second.initialCredential.initialPassword);
    const patch = kind === 'students' ? { birthDate: '2004-12-01', graduationDate: '2028-06-30' } : { department: '物理' };
    const changed = (await response(`/api/registrar/${kind}/${created.person.id}`, 'PATCH', { expectedVersion: 1, patch }, admin)).data;
    expect(changed.person).toMatchObject({ ...patch, account: created.person.account });
    expect((await response(`/api/registrar/${kind}/${second.person.id}`, 'GET', undefined, admin)).data.person).toEqual(second.person);
    await response(`/api/registrar/${kind}/${randomUUID()}`, 'GET', undefined, admin, 404);
    await response(`/api/registrar/${kind}/${created.person.id}`, 'DELETE', { expectedVersion: 2, confirmed: false }, admin, 400);
    await response(`/api/registrar/${kind}/${created.person.id}`, 'DELETE', { expectedVersion: 2, confirmed: true }, admin);
    expect((await f.request('/api/auth/login', 'POST', { account: created.person.account, password: created.initialCredential.initialPassword })).status).toBe(401);
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('people');
    sheet.addRow(['name', 'birthDate', 'ssn', 'status', ...(kind === 'professors' ? ['department'] : [])]);
    for (let i = 0; i < 3; i++) sheet.addRow([`新行${i}`, '2000-01-01', `TEST-IMPORT-${i}`, 'ACTIVE', ...(kind === 'professors' ? ['数学'] : [])]);
    sheet.addRow(['不得覆盖', '2000-01-01', 'TEST-NEW-B', 'ACTIVE', ...(kind === 'professors' ? ['数学'] : [])]);
    sheet.addRow(['', '2000-01-01', 'TEST-BAD', 'ACTIVE', ...(kind === 'professors' ? ['数学'] : [])]);
    const upload = async () => { const form = new FormData(); form.append('file', new File([await workbook.xlsx.writeBuffer() as ArrayBuffer], 'acceptance.xlsx')); return (await response(`/api/registrar/imports/${kind}`, 'POST', form, admin)).data; };
    const imported = await upload(); expect([imported.imported, imported.skipped, imported.rejected]).toEqual([3, 1, 1]);
    expect(imported.rows.map((r: { row: number }) => r.row)).toEqual([2, 3, 4, 5, 6]);
    expect(new Set(imported.rows.slice(0, 3).map((r: { initialPassword: string }) => r.initialPassword)).size).toBe(3);
    for (const row of imported.rows.slice(0, 3) as { account: string; initialPassword: string }[]) {
      const initial = await f.login(row.account, row.initialPassword);
      await response('/api/terms', 'GET', undefined, initial, 403);
      const changedPassword = `${randomUUID()}Aa1!`;
      await response('/api/auth/change-password', 'POST', { currentPassword: row.initialPassword, newPassword: changedPassword }, initial);
      expect((await f.request('/api/auth/login', 'POST', { account: row.account, password: row.initialPassword })).status).toBe(401);
      await f.login(row.account, changedPassword);
    }
    const repeated = await upload(); expect([repeated.imported, repeated.skipped, repeated.rejected]).toEqual([0, 4, 1]);
    expect((await response(`/api/registrar/${kind}/${second.person.id}`, 'GET', undefined, admin)).data.person.name).toBe('同名导入');
  });

  it('AC-60/61：历史不覆盖、上线拒绝/坏行独立；资格幂等且不自动授课', async () => {
    const auth = await f.login('R01');
    await f.db.gradeRecord.create({ data: { studentId: f.students[0]!.id, termId: f.ids.T0, courseId: 'math', courseNameSnapshot: 'math', source: 'IMPORT', value: 'B' } });
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('grades'); sheet.addRow(['studentNumber', 'courseId', 'termId', 'grade']);
    for (const row of [['S101', 'math', f.ids.T0, 'F'], ['S101', 'programming', f.ids.T0, 'D'], ['S101', 'math', f.ids.T1, 'A'], ['ABSENT', 'math', f.ids.T0, 'A'], ['S101', 'economics', f.ids.T0, 'Z']]) sheet.addRow(row);
    const form = new FormData(); form.append('file', new File([await workbook.xlsx.writeBuffer() as ArrayBuffer], 'history.xlsx'));
    const r = (await response('/api/registrar/imports/historical-grades', 'POST', form, auth)).data;
    expect([r.imported, r.skipped, r.rejected]).toEqual([1, 1, 3]);
    expect((await f.db.gradeRecord.findMany({ orderBy: { courseId: 'asc' } })).map(g => [g.courseId, g.value])).toEqual([['math', 'B'], ['programming', 'D']]);
    f.snapshot.courses.find(c => c.id === 'advanced')!.prerequisiteCourseIds = ['programming']; await f.sync();
    await write(0, choices(['M1', 'M2', 'M3', 'A1'], ['B1', 'B2']));
    await f.db.qualification.delete({ where: { professorId_courseId: { professorId: f.professors[1]!.id, courseId: 'math' } } });
    const otherBefore = await f.db.qualification.findMany({ where: { professorId: f.professors[2]!.id }, orderBy: { courseId: 'asc' } });
    const q = new ExcelJS.Workbook(); const qs = q.addWorksheet('q'); qs.addRow(['professorNumber', 'courseId']); qs.addRow(['P27', 'math']); qs.addRow(['P27', 'math']);
    const imported = await f.application.imports.run(registrar(), 'qualifications', Buffer.from(await q.xlsx.writeBuffer())); expect([imported.imported, imported.skipped]).toEqual([1, 1]);
    const catalog = await f.application.catalog.view(f.ids.T2, f.professors[1]!.id);
    expect(catalog.offerings.filter(o => o.courseId === 'math').map(o => o.eligibleToTeach)).toEqual([true, true]);
    expect((await f.application.teaching.view(f.professors[1]!.id, f.ids.T2)).offeringIds).toEqual([]);
    expect(await f.db.qualification.findMany({ where: { professorId: f.professors[2]!.id }, orderBy: { courseId: 'asc' } })).toEqual(otherBefore);
  });

  it('AC-14/15/16/17/18：授课整份替换、资格/占用/故障拒绝、名册排除保存备选退选', async () => {
    await f.db.offering.updateMany({ data: { professorId: null } });
    const p = await f.login('P11');
    const path = `/api/professor/terms/${f.ids.T2}/teaching`;
    await response(path, 'PUT', { expectedVersion: 0, offeringIds: ['M1', 'M2'] }, p);
    const before = await snapshot();
    await response(path, 'PUT', { expectedVersion: 1, offeringIds: ['M2', 'X2'] }, p, 422);
    expect(await snapshot()).toEqual(before);
    await response(path, 'PUT', { expectedVersion: 1, offeringIds: ['M1', 'B1'] }, p);
    const catalog = await f.application.catalog.view(f.ids.T2);
    expect(catalog.offerings.find(o => o.id === 'M2')!.professor).toBeNull();
    expect(catalog.offerings.filter(o => o.professor?.id === f.professors[0]!.id).map(o => o.id).sort()).toEqual(['B1', 'M1']);
    await f.db.qualification.deleteMany({ where: { professorId: f.professors[1]!.id } });
    expect((await f.application.catalog.view(f.ids.T2, f.professors[1]!.id)).offerings.every(o => !o.eligibleToTeach)).toBe(true);
    await expect(f.application.teaching.write(professor(1), f.ids.T2, 0, ['M2'])).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(f.application.teaching.write(professor(2), f.ids.T2, 0, ['M1'])).rejects.toMatchObject({ code: 'OFFERING_TAKEN' });
    await f.control('faults', { catalog: { mode: 'unavailable', delayMs: 0 }, billing: { mode: 'normal', delayMs: 0 } });
    await response(path, 'PUT', { expectedVersion: 2, offeringIds: [] }, p, 503);
    expect((await f.application.teaching.view(f.professors[0]!.id, f.ids.T2)).offeringIds).toEqual(['B1', 'M1']);
    await f.control('faults', { catalog: { mode: 'normal', delayMs: 0 }, billing: { mode: 'normal', delayMs: 0 } });
    await f.register(0, ['M1']); await write(0, choices(['M1'], []), 'SAVE', 1);
    await f.register(2, ['M2'], ['M1']); await f.register(3, ['M1']); await write(1, choices(['M2'], []), 'SUBMIT', 3);
    const readOnly = await snapshot();
    expect((await response('/api/professor/offerings/M1/roster', 'GET', undefined, p)).data.students.map((s: { studentNumber: string }) => s.studentNumber)).toEqual(['S101']);
    await response('/api/professor/offerings/M1/roster', 'GET', undefined, await f.login('P27'), 403);
    expect(await snapshot()).toEqual(readOnly);
    await write(1, choices([], []), 'DELETE');
    expect((await response('/api/professor/offerings/M1/roster', 'GET', undefined, p)).data.students).toEqual([]);
  });

  it.each(['SUSPENDED', 'GRADUATED'] as const)('AC-44/53：学生%s确认前只读，确认清本期，关闭历史及成绩保留', async status => {
    await write(0); await f.db.term.update({ where: { id: f.ids.T1 }, data: { closeState: 'CLOSED' } });
    await f.db.gradeRecord.create({ data: { studentId: f.students[0]!.id, termId: f.ids.T1, courseId: 'math', courseNameSnapshot: 'math', value: 'D', source: 'PROFESSOR' } });
    const input = { expectedVersion: 1, patch: { status } }; const prior = await snapshot();
    const preview = await f.application.people.preview(registrar(), 'students', f.students[0]!.id, input);
    expect(preview.impact.terms).toContainEqual({ termId: f.ids.T2, offeringIds: ['M1', 'M2', 'M3', 'M4'], clearSchedule: true, retainedClosedRecords: false });
    expect(await snapshot()).toEqual(prior);
    await expect(f.application.people.update(registrar(), 'students', f.students[0]!.id, input)).rejects.toMatchObject({ code: 'IMPACT_CHANGED' });
    await f.application.people.update(registrar(), 'students', f.students[0]!.id, { ...input, confirmed: true, impactToken: preview.impact.impactToken });
    expect(await view()).toMatchObject({ firstSubmittedAt: null, exists: false, registrations: [] });
    expect(await f.db.gradeRecord.findMany()).toEqual(prior.grades);
    const auth = await f.login('S101');
    expect((await response('/api/student/report-card', 'GET', undefined, auth)).data.rows).toMatchObject([{ grade: 'D' }]);
    await response(`/api/student/terms/${f.ids.T2}/schedule`, 'DELETE', { expectedVersion: 2, confirmed: true }, auth, 403);
  });

  it('AC-52：教授离职清开放学期，保留关闭班次及成绩、撤销现有会话', async () => {
    const h = { ...f.snapshot, termId: f.ids.T1, offerings: [{ ...f.snapshot.offerings[0]!, id: 'H1', termId: f.ids.T1 }] };
    await f.application.catalog.apply(h);
    await f.db.offering.update({ where: { externalOfferingId: 'H1' }, data: { professorId: f.professors[0]!.id } });
    await f.db.term.update({ where: { id: f.ids.T1 }, data: { closeState: 'CLOSED' } });
    const session = await f.login('P11'); const prior = await snapshot();
    const input = { expectedVersion: 1, patch: { status: 'DEPARTED' as const } };
    const preview = await f.application.people.preview(registrar(), 'professors', f.professors[0]!.id, input);
    expect(preview.impact.terms.find(t => t.termId === f.ids.T1)).toMatchObject({ offeringIds: ['H1'], retainedClosedRecords: true });
    expect(await snapshot()).toEqual(prior);
    await f.application.people.update(registrar(), 'professors', f.professors[0]!.id, { ...input, confirmed: true, impactToken: preview.impact.impactToken });
    expect(await f.db.offering.count({ where: { termId: f.ids.T2, professorId: f.professors[0]!.id } })).toBe(0);
    expect(await f.db.offering.findUnique({ where: { externalOfferingId: 'H1' } })).toEqual(prior.offerings.find(o => o.externalOfferingId === 'H1'));
    expect((await f.request('/api/auth/login', 'POST', { account: 'P11', password: f.password })).status).toBe(401);
    expect((await f.request('/api/auth/me', 'GET', undefined, session)).status).toBe(401);
  });

  it.each(['open-term', 'cancelled', 'no-professor', 'prerequisite', 'conflict', 'same-course', 'suspended', 'graduated', 'four'] as const)('AC-58/62：补选拒绝%s且完整快照不变，关闭不重开', async reason => {
    for (const o of ['M1', 'M2', 'M3', 'M4', 'X2', 'M1b']) await fill(o, 3, 10);
    await fill('B1', reason === 'four' ? 9 : 3, 20);
    await f.register(0, reason === 'four' ? ['M1', 'M2', 'M3', 'M4'] : ['M1', 'M2', 'M3']);
    if (reason !== 'open-term') await f.close(); let candidate = 'B1';
    if (reason === 'cancelled') await f.db.offering.update({ where: { externalOfferingId: 'B1' }, data: { status: 'CANCELLED' } });
    if (reason === 'no-professor') await f.db.offering.update({ where: { externalOfferingId: 'B1' }, data: { professorId: null } });
    if (reason === 'prerequisite') { f.snapshot.courses.find(c => c.id === 'programming')!.prerequisiteCourseIds = ['advanced']; await f.sync(); }
    if (reason === 'conflict') candidate = 'X2'; if (reason === 'same-course') candidate = 'M1b';
    if (reason === 'suspended' || reason === 'graduated') await f.db.student.update({ where: { id: f.students[0]!.id }, data: { status: reason === 'suspended' ? 'SUSPENDED' : 'GRADUATED' } });
    const before = await snapshot();
    await expect(f.application.close.supplement(registrar(), f.ids.T2, { studentId: f.students[0]!.id, offeringId: candidate, expectedVersion: 2 })).rejects.toMatchObject({ code: reason === 'suspended' || reason === 'graduated' ? 'FORBIDDEN' : reason === 'open-term' ? 'PHASE_FORBIDDEN' : 'RULE_VIOLATION' });
    if (reason === 'open-term') { expect(await snapshot()).toEqual(before); return; }
    for (const mode of ['SAVE', 'SUBMIT', 'DELETE'] as const) await expect(write(2, choices(), mode)).rejects.toMatchObject({ code: 'ALREADY_CLOSED' });
    await expect(f.application.teaching.write(professor(), f.ids.T2, 0, [])).rejects.toMatchObject({ code: 'ALREADY_CLOSED' });
    expect(await snapshot()).toEqual(before); expect((await f.db.term.findUniqueOrThrow({ where: { id: f.ids.T2 } })).closeState).toBe('CLOSED');
  });

  it('AC-25/27：注册、历史成绩、单独计费记录分别阻止删除，人员和历史保留', async () => {
    await f.register(0, ['M1']);
    await f.db.gradeRecord.create({ data: { studentId: f.students[1]!.id, courseId: 'math', termId: f.ids.T0, courseNameSnapshot: 'math', value: 'B', source: 'IMPORT' } });
    await f.db.billingOutbox.create({ data: { studentId: f.students[2]!.id, termId: f.ids.T0, businessId: randomUUID(), version: 1, amountYuan: 0, payload: {}, nextAttemptAt: f.clock.now } });
    const before = await snapshot(); const identities = await f.db.account.findMany({ orderBy: { id: 'asc' } });
    for (const s of f.students.slice(0, 3)) await expect(f.application.people.remove(registrar(), 'students', s.id, 1)).rejects.toMatchObject({ code: 'HAS_RECORDS' });
    await expect(f.application.people.remove(registrar(), 'professors', f.professors[0]!.id, 1)).rejects.toMatchObject({ code: 'HAS_RECORDS' });
    expect(await snapshot()).toEqual(before); expect(await f.db.account.findMany({ orderBy: { id: 'asc' } })).toEqual(identities);
  });

  it('AC-63：删除重建真正改变关闭争位顺序，不仅重置时间字段', async () => {
    f.clock.now = new Date('2026-09-26T01:00:00Z'); await write(0);
    f.clock.now = new Date('2026-09-30T01:00:00Z'); await write(0, choices(), 'SUBMIT', 1);
    await write(1, choices([], []), 'DELETE');
    f.clock.now = new Date('2026-10-01T01:00:00Z');
    await expect(write(2, choices(['M1', 'M2', 'M3']))).rejects.toMatchObject({ code: 'RULE_VIOLATION' });
    await write(2); await write(3, choices());
    for (const o of ['M1', 'M2', 'M3']) await fill(o, 1, 10);
    await fill('B1', 9, 20); await fill('B2', 3, 40);
    await f.db.offering.update({ where: { externalOfferingId: 'M4' }, data: { professorId: null } });
    await f.close();
    expect(await f.members('B1')).toContain('S205'); expect(await f.members('B1')).not.toContain('S101');
    expect(await f.members('B2')).toContain('S101'); expect((await view()).firstSubmittedAt).toBe('2026-10-01T01:00:00.000Z');
  });
});
