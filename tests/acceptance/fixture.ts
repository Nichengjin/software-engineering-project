import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { createApplication } from '../../apps/api/src/app.js';
import { hashPassword, randomToken } from '../../apps/api/src/auth/password.js';
import { activeRegistration, type Hook } from '../../apps/api/src/runtime/context.js';
import { httpExternal, type Snapshot } from '../../apps/api/src/runtime/external.js';
import { recover } from '../../apps/api/src/runtime/start.js';
import { startSimulatorServer } from '../../apps/simulators/src/server.js';
import type { SimulatorOptions } from '../../apps/simulators/src/app.js';
import { testDatabaseUrl } from '../../scripts/database-url.mjs';

export const choices = (primary = ['M1', 'M2', 'M3', 'M4'], alternate = ['B1', 'B2']) => ({
  primaryOfferingIds: primary, alternateOfferingIds: alternate,
});
export type Auth = { cookie: string; csrf: string };
export function barrier() {
  let arrived!: () => void; let release!: () => void;
  const reached = new Promise<void>(resolve => { arrived = resolve; });
  const paused = new Promise<void>(resolve => { release = resolve; });
  return { reached, release, wait: async () => { arrived(); await paused; } };
}

// Own a whole disposable database: runtime leadership/advisory locks are database-wide.
// Never migrate, truncate, seed or drop the caller's database.
async function localSimulator(options: SimulatorOptions) {
  const server = await startSimulatorServer(options, 0);
  const address = server.address(); assert(address && typeof address !== 'string');
  return { origin: `http://127.0.0.1:${address.port}`, close: async () => {
    if ('closeAllConnections' in server) server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  } };
}
export async function createFixture(studentCount = 80, startSimulator = localSimulator) {
  const base = testDatabaseUrl(process.env);
  const database = `acceptance_${randomUUID().replaceAll('-', '')}_test`;
  const admin = new Client({ connectionString: base });
  await admin.connect();
  const directory = await mkdtemp(join(tmpdir(), 'wylie-acceptance-'));
  const parsed = new URL(base); parsed.pathname = `/${database}`; parsed.searchParams.delete('schema');
  const url = parsed.toString();
  await admin.query(`CREATE DATABASE "${database}"`);
  const db = new PrismaClient({ datasourceUrl: url });
  let server: Awaited<ReturnType<typeof localSimulator>> | undefined;
  try {
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'packages/db/prisma/schema.prisma'], {
      env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe',
    });
    const password = randomToken(); const hash = await hashPassword(password);
    const ids = { T0: randomUUID(), T1: randomUUID(), T2: randomUUID(), T3: randomUUID() };
    const clock = { now: new Date('2026-09-28T02:00:00Z'), real: false };
    for (const [i, id] of Object.values(ids).entries()) {
      await db.term.create({ data: {
        id, name: `T${i}`, ordinal: i + 1, isLaunchTerm: i === 1,
        startsAt: new Date(['2025-01-01', '2026-01-01', '2026-09-01', '2027-02-01'][i]!),
        endsAt: new Date(['2025-07-01', '2026-08-01', '2027-01-01', '2027-07-01'][i]!),
        teachingStartsAt: new Date('2026-09-20T00:00:00Z'),
        initialStartsAt: new Date('2026-09-25T00:00:00Z'), initialEndsAt: new Date('2026-09-30T10:00:00Z'),
        addDropStartsAt: new Date('2026-10-01T00:00:00Z'), addDropEndsAt: new Date('2026-10-05T10:00:00Z'),
      } });
    }
    const students: { id: string; account: string; accountId: string }[] = [];
    const professors: { id: string; account: string; accountId: string }[] = [];
    const registrar = await db.account.create({ data: { account: 'R01', role: 'REGISTRAR', passwordHash: hash, mustChangePassword: false } });
    const labels = ['S101', 'S205', 'S310', 'S420', 'S550', 'S660'];
    await db.$transaction(async tx => {
      for (let i = 0; i < studentCount; i++) {
        const account = labels[i] ?? `S${1000 + i}`;
        const person = await tx.student.create({ data: { studentNumber: account, name: i < 2 ? '同名测试学生' : `虚构学生${i}`, ssn: `TEST-S-${i}`, birthDate: new Date('2005-02-10') } });
        await tx.personIdentity.create({ data: { ssn: person.ssn, studentId: person.id } });
        const user = await tx.account.create({ data: { account, role: 'STUDENT', studentId: person.id, passwordHash: hash, mustChangePassword: false } });
        students.push({ id: person.id, account, accountId: user.id });
      }
      for (const [i, account] of ['P11', 'P27', 'P39'].entries()) {
        const person = await tx.professor.create({ data: { professorNumber: account, name: `本地教授${i}`, ssn: `TEST-P-${i}`, birthDate: new Date('1980-01-01'), department: '测试学院' } });
        await tx.personIdentity.create({ data: { ssn: person.ssn, professorId: person.id } });
        const user = await tx.account.create({ data: { account, role: 'PROFESSOR', professorId: person.id, passwordHash: hash, mustChangePassword: false } });
        professors.push({ id: person.id, account, accountId: user.id });
      }
    }, { timeout: 120000 });
    const courseIds = ['math', 'physics', 'chemistry', 'art', 'programming', 'economics', 'advanced', 'extra'];
    const credits = ['3', '2', '4', '1', '5', '2', '6', '7'];
    const offerings = ['M1', 'M2', 'M3', 'M4', 'B1', 'B2', 'A1', 'E1'];
    const snapshot: Snapshot = {
      revision: '1', termId: ids.T2,
      courses: courseIds.map((id, i) => ({ id, name: id, department: '测试学院', credits: credits[i]!, prerequisiteCourseIds: [] })),
      offerings: offerings.map((id, i) => ({ id, termId: ids.T2, courseId: courseIds[i]!, meetings: [{ dayOfWeek: i % 7 + 1, startMinute: i < 7 ? 480 : 600, endMinute: i < 7 ? 540 : 660, fromDate: '2026-09-01', throughDate: '2026-12-31' }] })),
    };
    snapshot.offerings.push({ ...snapshot.offerings[0]!, id: 'M1b', meetings: [{ ...snapshot.offerings[0]!.meetings[0]!, startMinute: 720, endMinute: 780 }] });
    snapshot.offerings.push({ ...snapshot.offerings[1]!, id: 'X2', courseId: 'extra' });
    const catalogues = Object.values(ids).map(id => id === ids.T2 ? snapshot : { ...snapshot, termId: id, offerings: [] });
    const options = { seedPath: join(directory, 'seed.json'), statePath: join(directory, 'state.json'), externalToken: randomToken(), controlToken: randomToken(), controlEnabled: true };
    await writeFile(options.seedPath, JSON.stringify({ catalogs: catalogues }));
    server = await startSimulator(options);
    const simulatorUrl = server.origin;
    const config = { publicOrigin: 'http://localhost:5173', secureCookie: false, csrfSigningKey: randomToken(), impactSigningKey: randomToken(), pricePerCreditYuan: '125.00' };
    const logs: Record<string, unknown>[] = [];
    const fault = { handler: undefined as ((name: Hook) => Promise<void>) | undefined };
    const makeApplication = () => createApplication({ db, config, external: httpExternal({ catalogBaseUrl: simulatorUrl, billingBaseUrl: simulatorUrl, externalToken: options.externalToken }), clock: () => clock.real ? new Date() : clock.now, fault: name => fault.handler?.(name) ?? Promise.resolve(), log: entry => logs.push(entry) });
    const application = makeApplication();
    await recover(application); application.runtime.ready = true;
    await application.catalog.fresh(ids.T2);
    await db.offering.updateMany({ where: { termId: ids.T2 }, data: { professorId: professors[0]!.id } });
    await db.qualification.createMany({ data: professors.flatMap(p => courseIds.map(courseId => ({ professorId: p.id, courseId }))) });
    const actor = (accountId: string) => ({ accountId, requestId: randomUUID() });
    async function control(path: string, body?: unknown) {
      const response = await fetch(`${simulatorUrl}/control/${path}`, { method: body === undefined ? 'GET' : 'PUT', headers: { authorization: `Bearer ${options.controlToken}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      assert.equal(response.status, 200, `simulator control: ${path}`); return response.json();
    }
    async function request(path: string, method = 'GET', body?: unknown, auth?: Auth) {
      const headers: Record<string, string> = { Origin: config.publicOrigin };
      if (auth) { headers.Cookie = auth.cookie; headers['X-CSRF-Token'] = auth.csrf; }
      if (body !== undefined && !(body instanceof FormData)) headers['content-type'] = 'application/json';
      return application.app.request(`http://localhost${path}`, { method, headers, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
    }
    async function login(account: string, secret = password): Promise<Auth> {
      const response = await request('/api/auth/login', 'POST', { account, password: secret });
      assert.equal(response.status, 200, `login ${account}`);
      const body = await response.json();
      return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, csrf: body.data.csrfToken };
    }
    async function register(index: number, primary: string[], alternate: string[] = [], time = clock.now) {
      const studentId = students[index]!.id;
      await db.schedule.create({ data: { studentId, termId: ids.T2, exists: true, version: 1, firstSubmittedAt: time, savedChoices: choices(primary, alternate), submittedChoices: choices(primary, alternate) } });
      await db.registration.createMany({ data: primary.map(offeringId => ({ studentId, offeringId, source: 'SUBMIT' as const })) });
    }
    async function members(offeringId: string) {
      return (await db.registration.findMany({ where: { offeringId, ...activeRegistration }, include: { student: true } })).map(r => r.student.studentNumber).sort();
    }
    async function sync() { await control('catalog', { termId: snapshot.termId, courses: snapshot.courses, offerings: snapshot.offerings }); await application.catalog.fresh(ids.T2); }
    async function close() { await application.close.request(actor(registrar.id), ids.T2); await application.runtime.settle(); }
    async function dispose() {
      await application.runtime.settle();
      await server!.close();
      await db.$disconnect();
      await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`); await admin.end();
      await rm(directory, { recursive: true, force: true });
    }
    return { db, url, ids, students, professors, registrar, password, snapshot, clock, fault, config, logs, application, makeApplication, actor, request, login, register, members, sync, close, control, simulatorUrl, options, dispose };
  } catch (error) {
    await server?.close();
    await db.$disconnect(); await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`); await admin.end();
    await rm(directory, { recursive: true, force: true }); throw error;
  }
}
export type Fixture = Awaited<ReturnType<typeof createFixture>>;
