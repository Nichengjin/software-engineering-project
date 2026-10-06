import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { cpus, freemem, hostname, platform, release, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { Client } from 'pg';
import { startRuntime } from '../../apps/api/src/runtime/start.js';
import { activeRegistration } from '../../apps/api/src/runtime/context.js';
import type { Snapshot } from '../../apps/api/src/runtime/external.js';
import { createFixture, choices, type Auth } from '../acceptance/fixture.js';

type Operation = 'catalog' | 'schedule' | 'save' | 'submit' | 'grades';
type Sample = { operation: Operation; startedAt: string; durationMs: number; status: number | null; errorCode: string | null; success: boolean; within120s: boolean };
type Options = { users: number[]; warmupMs: number; steadyMs: number; rampMs: number; thinkMinMs: number; thinkMaxMs: number; timeoutMs: number; output: string; seed: number };
type Vu = { index: number; auth: Auth; version: number; primary: string[]; alternate: string[] };

const args = new Map(process.argv.slice(2).map(value => {
  const [key, raw = 'true'] = value.replace(/^--/, '').split('=', 2); return [key, raw];
}));
const numberArg = (name: string, fallback: number) => {
  const value = Number(args.get(name) ?? fallback); assert(Number.isFinite(value) && value >= 0, `Invalid --${name}`); return value;
};
const options: Options = {
  users: (args.get('users') ?? '500,2000').split(',').map(Number),
  warmupMs: numberArg('warmup-seconds', 300) * 1000,
  steadyMs: numberArg('steady-seconds', 1800) * 1000,
  rampMs: numberArg('ramp-seconds', 0) * 1000,
  thinkMinMs: numberArg('think-min-ms', 5000), thinkMaxMs: numberArg('think-max-ms', 15000),
  timeoutMs: numberArg('timeout-seconds', 120) * 1000,
  output: resolve(args.get('output') ?? `.amp/in/artifacts/load-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.json`),
  seed: numberArg('seed', 1803),
};
assert(options.users.every(value => Number.isInteger(value) && value > 0));
assert(options.thinkMaxMs >= options.thinkMinMs);
assert(options.rampMs <= options.warmupMs, 'All users must start during warmup');

function random(seed: number) {
  let state = seed >>> 0;
  return () => ((state = Math.imul(1664525, state) + 1013904223 >>> 0) / 2 ** 32);
}
const wait = (ms: number) => new Promise(resolveWait => setTimeout(resolveWait, ms));
const percentile = (sorted: number[], p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]! : null;

function loadSnapshot(base: Snapshot, userCount: number): Snapshot {
  const groups = Math.ceil(userCount / 10); const courses: Snapshot['courses'] = []; const offerings: Snapshot['offerings'] = [];
  for (let group = 0; group < groups; group++) for (let slot = 0; slot < 6; slot++) {
    const courseId = `load-g${group}-c${slot}`; const id = `load-g${group}-o${slot}`;
    courses.push({ id: courseId, name: `负载课程 ${group}-${slot}`, department: '负载测试', credits: '1', prerequisiteCourseIds: [] });
    offerings.push({ id, termId: base.termId, courseId, meetings: [{ dayOfWeek: slot + 1, startMinute: 480, endMinute: 540, fromDate: '2026-09-01', throughDate: '2026-12-31' }] });
  }
  return { revision: `load-${userCount}`, termId: base.termId, courses, offerings };
}

async function listen(fetch: (request: Request) => Response | Promise<Response>) {
  const server = serve({ fetch, port: 0, hostname: '127.0.0.1' });
  await new Promise<void>((resolveReady, reject) => { server.once('listening', resolveReady); server.once('error', reject); });
  const address = server.address(); assert(address && typeof address !== 'string');
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((done, reject) => {
    (server as Server).closeAllConnections(); server.close(error => error ? reject(error) : done());
  }) };
}

async function runScale(userCount: number, scaleSeed: number) {
  const fixture = await createFixture(userCount); let stopRuntime: (() => Promise<void>) | undefined; let http: Awaited<ReturnType<typeof listen>> | undefined;
  const startedWall = new Date(); const setupStarted = performance.now();
  // Optional test-side probes only: no product timeouts, pool sizes or locking change.
  const diagnostic = args.get('diagnostics') === 'true';
  const stages: Record<string, { durations: number[]; failures: number; active: number; peakActive: number }> = {};
  const errorCauses: Record<string, number> = {};
  const serverResponses: Record<string, number> = {};
  const databaseSamples: unknown[] = [];
  const loop = monitorEventLoopDelay({ resolution: 20 });
  let probe: Client | undefined; let probeTimer: ReturnType<typeof setInterval> | undefined; let probePending: Promise<void> | undefined;
  const record = (name: string, duration: number) => {
    const stage = stages[name] ??= { durations: [], failures: 0, active: 0, peakActive: 0 };
    stage.durations.push(duration);
  };
  const measured = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
    const stage = stages[name] ??= { durations: [], failures: 0, active: 0, peakActive: 0 };
    stage.peakActive = Math.max(stage.peakActive, ++stage.active); const start = performance.now();
    try { return await action(); } catch (error) { stage.failures++; throw error; }
    finally { stage.active--; record(name, performance.now() - start); }
  };
  try {
    const snapshot = loadSnapshot(fixture.snapshot, userCount);
    await fixture.control('catalog', { termId: snapshot.termId, courses: snapshot.courses, offerings: snapshot.offerings });
    await fixture.application.catalog.fresh(fixture.ids.T2);
    const groups = Math.ceil(userCount / 10);
    await fixture.db.$transaction(async tx => {
      for (let index = 0; index < userCount; index++) {
        const group = Math.floor(index / 10); const primary = [0, 1, 2, 3].map(slot => `load-g${group}-o${slot}`); const alternate = [4, 5].map(slot => `load-g${group}-o${slot}`);
        await tx.schedule.create({ data: { studentId: fixture.students[index]!.id, termId: fixture.ids.T2, exists: true, version: 1, firstSubmittedAt: fixture.clock.now, savedChoices: choices(primary, alternate), submittedChoices: choices(primary, alternate) } });
        await tx.registration.createMany({ data: primary.map(offeringId => ({ studentId: fixture.students[index]!.id, offeringId, source: 'SUBMIT' as const })) });
      }
    }, { timeout: 300_000 });
    stopRuntime = await startRuntime(fixture.application, fixture.url, () => { throw new Error('Runtime leadership lost'); });
    http = await listen(fixture.application.app.fetch);

    const auth: Auth[] = new Array(userCount); const loginStarted = performance.now();
    for (let offset = 0; offset < userCount; offset += 25) await Promise.all(fixture.students.slice(offset, offset + 25).map(async (student, delta) => {
      const response = await fetch(`${http!.origin}/api/auth/login`, { method: 'POST', headers: { Origin: fixture.config.publicOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ account: student.account, password: fixture.password }) });
      assert.equal(response.status, 200, `login ${student.account}`); const body = await response.json() as { data: { csrfToken: string } };
      auth[offset + delta] = { cookie: response.headers.get('set-cookie')!.split(';')[0]!, csrf: body.data.csrfToken };
    }));
    const vus: Vu[] = auth.map((identity, index) => { const group = Math.floor(index / 10); return { index, auth: identity, version: 1, primary: [0, 1, 2, 3].map(slot => `load-g${group}-o${slot}`), alternate: [4, 5].map(slot => `load-g${group}-o${slot}`) }; });
    const setupMs = performance.now() - setupStarted; const loginMs = performance.now() - loginStarted;
    if (diagnostic) {
      fixture.logs.length = 0;
      const { catalog, runtime } = fixture.application;
      const freshContext = new AsyncLocalStorage<{ calledAt: number }>();
      const fresh = catalog.fresh.bind(catalog); const external = runtime.external.catalog.bind(runtime.external);
      const apply = catalog.apply.bind(catalog); const transaction = runtime.transaction.bind(runtime);
      catalog.fresh = (...parameters) => measured('catalog.fresh.total', () => freshContext.run({ calledAt: performance.now() }, () => fresh(...parameters)));
      runtime.external.catalog = (...parameters) => {
        const context = freshContext.getStore();
        if (context) record('catalog.fresh.queue', performance.now() - context.calledAt);
        return measured('catalog.external.http', () => external(...parameters));
      };
      catalog.apply = (...parameters) => measured('catalog.apply', () => apply(...parameters));
      runtime.transaction = (termIds, fn) => {
        const start = performance.now();
        return measured('transaction.total', () => transaction(termIds, tx => {
          record('transaction.connectionAndLocks', performance.now() - start);
          return measured('transaction.body', () => fn(tx));
        }));
      };
      probe = new Client({ connectionString: fixture.url, application_name: 'load-diagnostic', statement_timeout: 3000 });
      await probe.connect(); loop.enable();
      const sampleDatabase = async () => {
        const start = performance.now();
        try {
          const activity = await probe!.query(`SELECT state, wait_event_type, wait_event, count(*)::int AS connections,
            max(extract(epoch FROM clock_timestamp()-query_start)*1000)::float AS oldest_query_ms
            FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() GROUP BY 1,2,3`);
          databaseSamples.push({ at: new Date().toISOString(), roundTripMs: performance.now() - start, activity: activity.rows });
        } catch (error) { databaseSamples.push({ at: new Date().toISOString(), error: error instanceof Error ? error.name : 'unknown' }); }
      };
      probeTimer = setInterval(() => {
        if (!probePending) probePending = sampleDatabase().finally(() => { probePending = undefined; });
      }, 5000);
    }
    const samples: Sample[] = []; const activeCurve: { atMs: number; runningUsers: number; inFlight: number; rssBytes: number; freeMemoryBytes: number }[] = [];
    let runningUsers = 0; let inFlight = 0; let phase: 'warmup' | 'steady' | 'done' = 'warmup';
    type PhaseTiming = { startedAt: string; endedAt: string | undefined; actualMs: number | undefined };
    const runStarted = performance.now(); const warmupTiming: PhaseTiming = { startedAt: new Date().toISOString(), endedAt: undefined, actualMs: undefined }; const phaseTimes: Record<string, PhaseTiming> = { warmup: warmupTiming };
    const cpuStart = process.cpuUsage();
    const collectLogs = () => {
      if (diagnostic) for (const entry of fixture.logs) {
        const key = `${entry.route ?? 'background'}:${entry.status ?? entry.errorCode ?? 'unknown'}`;
        serverResponses[key] = (serverResponses[key] ?? 0) + 1;
        if (typeof entry.durationMs === 'number') record(`server.${key}`, entry.durationMs);
      }
      fixture.logs.length = 0;
    };
    const monitor = setInterval(() => {
      activeCurve.push({ atMs: Math.round(performance.now() - runStarted), runningUsers, inFlight, rssBytes: process.memoryUsage().rss, freeMemoryBytes: freemem() });
      collectLogs();
      if (activeCurve.length % (diagnostic ? 15 : 60) === 0) console.log(JSON.stringify({ scale: userCount, phase, elapsedSeconds: Math.round((performance.now() - runStarted) / 1000), inFlight, measured: samples.length, ...(diagnostic ? { stages: Object.fromEntries(Object.entries(stages).filter(([name]) => !name.startsWith('server.')).map(([name, stage]) => [name, { active: stage.active, completed: stage.durations.length, lastMs: stage.durations.at(-1), failures: stage.failures }])), errorCauses, database: databaseSamples.at(-1) } : {}) }));
    }, 1000);
    const choose = (value: number): Operation => value < .40 ? 'catalog' : value < .65 ? 'schedule' : value < .80 ? 'save' : value < .90 ? 'submit' : 'grades';
    const request = async (vu: Vu, operation: Operation) => {
      const init: RequestInit = { headers: { Origin: fixture.config.publicOrigin, Cookie: vu.auth.cookie, 'X-CSRF-Token': vu.auth.csrf } };
      let loadChoices: { primary: string[]; alternate: string[] } | undefined;
      let path = ''; if (operation === 'catalog') path = `/api/catalog?termId=${fixture.ids.T2}`;
      else if (operation === 'schedule') path = `/api/student/terms/${fixture.ids.T2}/schedule`;
      else if (operation === 'grades') path = '/api/student/report-card';
      else {
        path = `/api/student/terms/${fixture.ids.T2}/schedule${operation === 'submit' ? '/submit' : ''}`; init.method = operation === 'submit' ? 'POST' : 'PUT'; (init.headers as Record<string, string>)['content-type'] = 'application/json';
        const group = Math.floor(vu.index / 10); const exchangingTo = vu.primary.includes(`load-g${group}-o3`) ? `load-g${group}-o4` : `load-g${group}-o3`;
        const submittedPrimary = operation === 'submit' ? [...vu.primary.slice(0, 3), exchangingTo] : vu.primary;
        const submittedAlternate = operation === 'submit' ? [`load-g${group}-${exchangingTo.endsWith('o3') ? 'o4' : 'o3'}`, `load-g${group}-o5`] : vu.alternate;
        init.body = JSON.stringify({ ...choices(submittedPrimary, submittedAlternate), expectedVersion: vu.version });
        if (operation === 'submit') loadChoices = { primary: submittedPrimary, alternate: submittedAlternate };
      }
      const controller = new AbortController(); init.signal = controller.signal; const timer = setTimeout(() => controller.abort(), options.timeoutMs);
      const began = performance.now(); const phaseAtStart = phase; let status: number | null = null; let errorCode: string | null = null; let success = false;
      inFlight++;
      try {
        const response = await fetch(`${http!.origin}${path}`, init); status = response.status;
        const payload = await response.json().catch(() => null) as { data?: { schedule?: { version: number } }; error?: { code?: string } } | null;
        errorCode = response.ok ? null : payload?.error?.code ?? `HTTP_${response.status}`; success = response.ok;
        if (success && (operation === 'save' || operation === 'submit')) vu.version = payload!.data!.schedule!.version;
        if (success && operation === 'submit') { assert(loadChoices); vu.primary = loadChoices.primary; vu.alternate = loadChoices.alternate; }
      } catch (error) {
        errorCode = error instanceof Error && error.name === 'AbortError' ? 'CLIENT_TIMEOUT' : 'NETWORK_ERROR';
        if (diagnostic) {
          // Retain names/codes, never URLs, credentials, response payloads or stacks.
          const chain: string[] = []; let cause: unknown = error;
          for (let depth = 0; cause instanceof Error && depth < 5; depth++, cause = cause.cause) {
            chain.push(`${cause.name}:${'code' in cause ? String(cause.code) : 'no-code'}:${'syscall' in cause ? String(cause.syscall) : 'no-syscall'}`);
          }
          const key = `${operation}:${controller.signal.aborted ? 'deadline' : 'other'}:${status ?? 'no-response'}:${chain.join('>')}`;
          errorCauses[key] = (errorCauses[key] ?? 0) + 1;
        }
      }
      finally { clearTimeout(timer); inFlight--; }
      const durationMs = performance.now() - began;
      if (phaseAtStart === 'steady') samples.push({ operation, startedAt: new Date(Date.now() - durationMs).toISOString(), durationMs, status, errorCode, success, within120s: success && durationMs <= 120_000 });
    };
    const workers = vus.map(async vu => {
      if (options.rampMs) await wait(vu.index / userCount * options.rampMs);
      const rng = random(scaleSeed + vu.index * 7919); runningUsers++;
      try { while (phase !== 'done') { await request(vu, choose(rng())); await wait(options.thinkMinMs + rng() * (options.thinkMaxMs - options.thinkMinMs)); } }
      finally { runningUsers--; }
    });
    await wait(options.warmupMs); warmupTiming.endedAt = new Date().toISOString(); warmupTiming.actualMs = performance.now() - runStarted;
    phase = 'steady'; const steadyStarted = performance.now(); const steadyTiming: PhaseTiming = { startedAt: new Date().toISOString(), endedAt: undefined, actualMs: undefined }; phaseTimes.steady = steadyTiming;
    await wait(options.steadyMs); phase = 'done'; steadyTiming.endedAt = new Date().toISOString(); steadyTiming.actualMs = performance.now() - steadyStarted;
    await Promise.all(workers);
    // Client abort does not cancel an admitted write. Quiesce the real runtime
    // before comparing schedules/registrations, not later during fixture disposal.
    const drainStarted = performance.now();
    const drainTiming: PhaseTiming = { startedAt: new Date().toISOString(), endedAt: undefined, actualMs: undefined }; phaseTimes.serverDrain = drainTiming;
    try { await stopRuntime(); stopRuntime = undefined; }
    finally { clearInterval(monitor); collectLogs(); }
    drainTiming.endedAt = new Date().toISOString(); drainTiming.actualMs = performance.now() - drainStarted;
    activeCurve.push({ atMs: Math.round(performance.now() - runStarted), runningUsers, inFlight, rssBytes: process.memoryUsage().rss, freeMemoryBytes: freemem() });
    const cpu = process.cpuUsage(cpuStart); const wallMs = performance.now() - runStarted;

    const active = await fixture.db.registration.findMany({ where: { offering: { termId: fixture.ids.T2 }, ...activeRegistration }, select: { studentId: true, offeringId: true } });
    const byOffering = new Map<string, number>(); const byStudent = new Map<string, string[]>();
    for (const row of active) { byOffering.set(row.offeringId, (byOffering.get(row.offeringId) ?? 0) + 1); byStudent.set(row.studentId, [...(byStudent.get(row.studentId) ?? []), row.offeringId].sort()); }
    const schedules = await fixture.db.schedule.findMany({ where: { termId: fixture.ids.T2 }, select: { studentId: true, submittedChoices: true } });
    const overCapacity = [...byOffering].filter(([, count]) => count > 10); const overFour = [...byStudent].filter(([, ids]) => ids.length > 4);
    const contentMismatches = schedules.filter(row => {
      const submitted = row.submittedChoices as { primaryOfferingIds?: string[] } | null; return JSON.stringify([...(submitted?.primaryOfferingIds ?? [])].sort()) !== JSON.stringify(byStudent.get(row.studentId) ?? []);
    });
    const clientExpectationMismatches = vus.filter(vu => JSON.stringify([...vu.primary].sort()) !== JSON.stringify(byStudent.get(fixture.students[vu.index]!.id) ?? [])).length;

    const sorted = samples.map(sample => sample.durationMs).sort((a, b) => a - b); const initiated = samples.length; const successes = samples.filter(sample => sample.success);
    const catalog = samples.filter(sample => sample.operation === 'catalog'); const catalogSuccess = catalog.filter(sample => sample.success); const errors: Record<string, number> = {};
    for (const sample of samples.filter(sample => !sample.success)) errors[sample.errorCode ?? `HTTP_${sample.status ?? 'NONE'}`] = (errors[sample.errorCode ?? `HTTP_${sample.status ?? 'NONE'}`] ?? 0) + 1;
    return {
      scale: userCount, startedAt: startedWall.toISOString(), setupMs, loginMs, workload: { distinctAuthenticatedUsers: userCount, groups, offeringsPerGroup: 6, catalogCourses: snapshot.courses.length, catalogOfferings: snapshot.offerings.length, groupSizeMaximum: 10, capacity: 10, submitBehavior: 'legally exchange the fourth registration between group offerings o3 and o4', weights: { catalog: .4, schedule: .25, save: .15, submit: .1, grades: .1 }, thinkTimeMs: [options.thinkMinMs, options.thinkMaxMs], clientTimeoutMs: options.timeoutMs },
      phases: phaseTimes, metrics: { initiatedTransactions: initiated, successfulTransactions: successes.length, successfulWithin120s: samples.filter(sample => sample.within120s).length, successfulWithin120sRatioOfAllInitiated: initiated ? samples.filter(sample => sample.within120s).length / initiated : null, latencyMs: { p50: percentile(sorted, .5), p95: percentile(sorted, .95), p99: percentile(sorted, .99), max: sorted.at(-1) ?? null }, errors, byOperation: Object.fromEntries((['catalog','schedule','save','submit','grades'] as Operation[]).map(operation => { const rows = samples.filter(sample => sample.operation === operation); return [operation, { initiated: rows.length, successful: rows.filter(sample => sample.success).length, errors: rows.filter(sample => !sample.success).length }]; })), catalog: { initiated: catalog.length, successful: catalogSuccess.length, successfulWithin10s: catalogSuccess.filter(sample => sample.durationMs <= 10_000).length, successfulWithin10sRatioOfSuccessful: catalogSuccess.length ? catalogSuccess.filter(sample => sample.durationMs <= 10_000).length / catalogSuccess.length : null, successfulWithin10sRatioOfInitiated: catalog.length ? catalogSuccess.filter(sample => sample.durationMs <= 10_000).length / catalog.length : null } },
      validation: { passed: active.length === userCount * 4 && !overCapacity.length && !overFour.length && !contentMismatches.length && !clientExpectationMismatches, expectedActiveRegistrations: userCount * 4, actualActiveRegistrations: active.length, maximumOfferingOccupancy: Math.max(...byOffering.values()), overCapacityOfferings: overCapacity, studentsOverFour: overFour, scheduleContentMismatches: contentMismatches.length, clientExpectationMismatches },
      resources: { processCpuUserMs: cpu.user / 1000, processCpuSystemMs: cpu.system / 1000, processCpuPercentOfOneCore: wallMs ? (cpu.user + cpu.system) / 1000 / wallMs * 100 : null, processPeakRssBytes: Math.max(...activeCurve.map(point => point.rssBytes)), activeUsers: activeCurve, hostFreeMemoryBytesAtEnd: freemem() },
      ...(diagnostic ? { diagnostics: { scope: 'warmup + steady + client/server drain; optional probes add overhead', errorCauses, serverResponses, databaseSamples, eventLoopMs: { mean: loop.mean / 1e6, p99: loop.percentile(99) / 1e6, max: loop.max / 1e6 }, stages: Object.fromEntries(Object.entries(stages).map(([name, stage]) => {
        const values = stage.durations.sort((a, b) => a - b);
        return [name, { count: values.length, failures: stage.failures, active: stage.active, peakActive: stage.peakActive, p50Ms: percentile(values, .5), p95Ms: percentile(values, .95), maxMs: values.at(-1) ?? null }];
      })) } } : {}),
    };
  } finally {
    clearInterval(probeTimer); await probePending; loop.disable(); await probe?.end();
    await http?.close().catch(() => {}); await stopRuntime?.().catch(() => {}); await fixture.dispose();
  }
}

const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), command: process.argv.map(value => value.includes('password') ? '[REDACTED]' : value), environment: { hostname: hostname(), os: `${platform()} ${release()}`, architecture: process.arch, cpu: cpus()[0]?.model ?? 'unknown', logicalCpuCount: cpus().length, totalMemoryBytes: totalmem(), node: process.version, topology: 'one Node/Hono API listener + one PostgreSQL database + one real HTTP catalog/billing simulator; all localhost; one disposable database per scale; scales run serially' }, options: { ...options, output: options.output }, results: [] as unknown[] };
await mkdir(resolve(options.output, '..'), { recursive: true });
for (const [index, userCount] of options.users.entries()) {
  console.log(`Starting ${userCount}-user scale`);
  try {
    const result = await runScale(userCount, options.seed + index * 1_000_003);
    report.results.push(result);
    if (!result.validation.passed ||
        (result.metrics.successfulWithin120sRatioOfAllInitiated ?? 0) < 0.8 ||
        result.metrics.catalog.initiated === 0 ||
        result.metrics.catalog.successfulWithin10s !== result.metrics.catalog.initiated) process.exitCode = 1;
  }
  catch (error) { report.results.push({ scale: userCount, aborted: true, error: error instanceof Error ? error.message : String(error) }); process.exitCode = 1; }
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}
console.log(`Load report: ${options.output}`);
