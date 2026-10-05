import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { ServerType } from '@hono/node-server';
import type { BillingMessage, CatalogSnapshot, SimFaults } from '@wylie/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSimulatorApp, type SimulatorOptions } from '../src/app.js';
import { startSimulatorServer } from '../src/server.js';

const catalog: CatalogSnapshot = {
  revision: '7', termId: 'test-term',
  courses: [
    { id: 'intro', name: 'Introduction', department: 'Science', credits: '3.00', prerequisiteCourseIds: [] },
    { id: 'advanced', name: 'Advanced', department: 'Science', credits: '4.00', prerequisiteCourseIds: ['intro'] },
  ],
  offerings: [
    { id: 'intro-a', termId: 'test-term', courseId: 'intro', meetings: [
      { dayOfWeek: 1, startMinute: 540, endMinute: 600, fromDate: '2026-09-01', throughDate: '2026-12-31' },
    ] },
    { id: 'advanced-a', termId: 'test-term', courseId: 'advanced', meetings: [
      { dayOfWeek: 3, startMinute: 600, endMinute: 660, fromDate: '2026-10-01', throughDate: '2026-12-31' },
    ] },
  ],
};

function bill(version = 1): BillingMessage {
  return {
    businessId: `test-term:student-a:${version}`, studentId: 'student-a',
    studentNumber: 'S000123', studentName: 'Fictional Student', termId: 'test-term', version,
    closedAt: '2026-10-05T12:00:00.000Z',
    offerings: [{ offeringId: 'intro-a', courseId: 'intro', courseName: 'Introduction', credits: '3.00' }],
    totalCredits: '3.00', pricePerCreditYuan: '400.00', amountYuan: '1200.00',
  };
}

function newerBill(): BillingMessage {
  return { ...bill(2), offerings: [
    ...bill().offerings,
    { offeringId: 'extra-a', courseId: 'extra', courseName: 'Extra Course', credits: '0.75' },
  ], totalCredits: '3.75', amountYuan: '1500.00' };
}

const normalFaults: SimFaults = {
  catalog: { mode: 'normal', delayMs: 0 }, billing: { mode: 'normal', delayMs: 0 },
};

describe('independent simulators over real HTTP', () => {
  let directory: string;
  let options: SimulatorOptions;
  let server: ServerType | undefined;
  let baseUrl: string;
  let child: ChildProcess | undefined;

  async function stopServer() {
    if (!server) return;
    const current = server;
    server = undefined;
    await new Promise<void>((resolve, reject) => {
      current.close((error) => error ? reject(error) : resolve());
      if ('closeAllConnections' in current) current.closeAllConnections();
    });
  }

  async function start(overrides: Partial<SimulatorOptions> = {}) {
    server = await startSimulatorServer({ ...options, ...overrides }, 0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  async function startChild(port: number, seedPath = options.seedPath, cwd?: string) {
    child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../src/index.ts', import.meta.url))], {
      ...(cwd ? { cwd } : {}),
      env: { ...process.env, SIM_SEED_PATH: seedPath, SIM_STATE_PATH: options.statePath,
        EXTERNAL_SERVICE_TOKEN: options.externalToken, SIM_CONTROL_ENABLED: 'true',
        SIM_CONTROL_TOKEN: options.controlToken!, SIM_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise<void>((resolve, reject) => {
      child!.stdout!.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('"event":"listening"')) resolve();
      });
      child!.once('error', reject);
      child!.once('exit', () => reject(new Error('Simulator child exited before listening')));
    });
  }

  async function request(path: string, body?: unknown, token = options.externalToken, method?: string) {
    return fetch(`${baseUrl}${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function faults(value: SimFaults) {
    const response = await request('/control/faults', value, options.controlToken!, 'PUT');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  }

  async function bills() {
    const response = await request('/control/bills?termId=test-term&studentId=student-a', undefined, options.controlToken!);
    expect(response.status).toBe(200);
    return response.json();
  }

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'wylie-sim-'));
    options = {
      seedPath: join(directory, 'catalog.json'), statePath: join(directory, 'state.json'),
      externalToken: randomUUID(), controlEnabled: true, controlToken: randomUUID(),
    };
    await writeFile(options.seedPath, JSON.stringify({ catalogs: [catalog] }));
    await start();
  });

  afterEach(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
    child = undefined;
    await stopServer();
    await rm(directory, { recursive: true, force: true });
  });

  it('serves the authoritative seed unchanged and does not fabricate unknown terms', async () => {
    const response = await request('/catalog/snapshot?termId=test-term');
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-ID')).toBeTruthy();
    expect(await response.json()).toEqual(catalog);
    expect((await request('/catalog/snapshot?termId=unknown-term')).status).toBe(404);
    expect((await request('/catalog/snapshot')).status).toBe(400);
  });

  it('reads the base seed IDs through the executable with root-relative env paths even in workspace cwd', async () => {
    const port = (server!.address() as AddressInfo).port;
    await stopServer();
    options.statePath = join(directory, 'base-seed-state.json');
    await startChild(port, 'packages/db/seed/catalog.json', fileURLToPath(new URL('../', import.meta.url)));
    const seed = JSON.parse(await readFile(new URL('../../../packages/db/seed/catalog.json', import.meta.url), 'utf8'));
    for (const snapshot of seed.catalogs) {
      const response = await request(`/catalog/snapshot?termId=${snapshot.termId}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(snapshot);
    }
  });

  it('rejects unauthorized external and control access with separate tokens', async () => {
    expect((await request('/catalog/snapshot?termId=test-term', undefined, '')).status).toBe(401);
    expect((await request('/billing', bill(), options.controlToken!)).status).toBe(401);
    expect((await request('/control/faults', normalFaults, options.externalToken, 'PUT')).status).toBe(401);
    expect((await request('/control/catalog', { ...catalog }, options.externalToken, 'PUT')).status).toBe(401);
    expect((await request('/control/bills?termId=test-term&studentId=student-a', undefined, '')).status).toBe(401);
    expect(await bills()).toEqual({ latestVersion: 0, latestAmountYuan: '0.00', acceptedBusinessIds: [] });
    await stopServer();
    await start({ controlEnabled: false });
    for (const [path, method] of [['/control/faults', 'PUT'], ['/control/catalog', 'PUT'], ['/control/bills', 'GET']]) {
      expect((await request(path!, method === 'GET' ? undefined : {}, options.controlToken!, method)).status).toBe(404);
    }
    await expect(createSimulatorApp({ ...options, controlToken: options.externalToken })).rejects.toThrow('separate');
  });

  it('deduplicates concurrent and reordered-property retries without adding money', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => request('/billing', bill())));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const acknowledgements = await Promise.all(responses.map((response) => response.json()));
    expect(acknowledgements.filter((ack) => ack.outcome === 'APPLIED')).toHaveLength(1);
    expect(acknowledgements.filter((ack) => ack.outcome === 'DUPLICATE')).toHaveLength(7);
    const reversed = Object.fromEntries(Object.entries(bill()).reverse());
    expect(await (await request('/billing', reversed)).json()).toEqual({
      businessId: bill().businessId, version: 1, outcome: 'DUPLICATE', latestVersion: 1,
    });
    expect(await bills()).toEqual({ latestVersion: 1, latestAmountYuan: '1200.00', acceptedBusinessIds: [bill().businessId] });
    expect((await stat(options.statePath)).mode & 0o777).toBe(0o600);
  });

  it('rejects the same business ID with different valid payload and keeps the original', async () => {
    expect((await request('/billing', bill())).status).toBe(200);
    const response = await request('/billing', { ...bill(), studentName: 'Different identity' });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: 'INVALID_BILLING_PAYLOAD' } });
    expect(await bills()).toEqual({ latestVersion: 1, latestAmountYuan: '1200.00', acceptedBusinessIds: [bill().businessId] });
  });

  it('replaces 1200 with 1500 and never sums successive versions', async () => {
    await request('/billing', bill());
    expect(await (await request('/billing', newerBill())).json()).toEqual({
      businessId: newerBill().businessId, version: 2, outcome: 'APPLIED', latestVersion: 2,
    });
    expect(await bills()).toEqual({ latestVersion: 2, latestAmountYuan: '1500.00',
      acceptedBusinessIds: [bill().businessId, newerBill().businessId] });
  });

  it('keeps 1500 when version 2 arrives before the older 1200 version, including after restart', async () => {
    await request('/billing', newerBill());
    expect(await (await request('/billing', bill())).json()).toEqual({
      businessId: bill().businessId, version: 1, outcome: 'STALE', latestVersion: 2,
    });
    await stopServer();
    await start();
    expect(await (await request('/billing', bill())).json()).toEqual({
      businessId: bill().businessId, version: 1, outcome: 'DUPLICATE', latestVersion: 2,
    });
    expect((await request('/billing', { ...bill(), studentNumber: 'S999999' })).status).toBe(409);
    expect(await bills()).toEqual({ latestVersion: 2, latestAmountYuan: '1500.00',
      acceptedBusinessIds: [newerBill().businessId, bill().businessId] });
  });

  it('isolates bills for different students and terms instead of global version or amount', async () => {
    await request('/billing', newerBill());
    const other = { ...bill(), studentId: 'student-b', businessId: 'test-term:student-b:1',
      offerings: [], totalCredits: '0.00', amountYuan: '0.00' };
    expect((await (await request('/billing', other)).json()).outcome).toBe('APPLIED');
    const differentTerm = { ...bill(), termId: 'another-term', businessId: 'another-term:student-a:1' };
    expect((await (await request('/billing', differentTerm)).json()).outcome).toBe('APPLIED');
    expect((await bills()).latestAmountYuan).toBe('1500.00');
    const response = await request('/control/bills?termId=test-term&studentId=student-b', undefined, options.controlToken!);
    expect(await response.json()).toEqual({ latestVersion: 1, latestAmountYuan: '0.00', acceptedBusinessIds: [other.businessId] });
  });

  it.each([
    ['wrong amount', { amountYuan: '1199.99' }],
    ['wrong total', { totalCredits: '4.00' }],
    ['wrong business ID', { businessId: 'test-term:student-a:2' }],
    ['negative money', { pricePerCreditYuan: '-400.00', amountYuan: '-1200.00' }],
    ['numeric amount', { amountYuan: 1200 }],
    ['fractional version', { version: 1.5 }],
    ['unsafe version', { version: Number.MAX_SAFE_INTEGER + 1, businessId: `test-term:student-a:${Number.MAX_SAFE_INTEGER + 1}` }],
    ['blank identity', { studentName: ' ' }],
    ['exponent money', { amountYuan: '1.2e3' }],
    ['extra precision', { amountYuan: '1200.001' }],
    ['unknown sensitive property', { grade: 'A' }],
    ['nested sensitive property', { offerings: [{ ...bill().offerings[0], ssn: 'PRIVATE' }] }],
    ['duplicate offering', { offerings: [...bill().offerings, ...bill().offerings], totalCredits: '6.00', amountYuan: '2400.00' }],
  ])('rejects %s without storing any billing fact', async (_name, patch) => {
    const response = await request('/billing', { ...bill(), ...patch });
    expect(response.status).toBe(400);
    expect(await bills()).toEqual({ latestVersion: 0, latestAmountYuan: '0.00', acceptedBusinessIds: [] });
  });

  it('computes fractional credits exactly and accepts zero-course zero bills', async () => {
    const fractional = { ...bill(), offerings: [{ ...bill().offerings[0]!, credits: '0.30' }],
      totalCredits: '0.30', pricePerCreditYuan: '0.10', amountYuan: '0.03' };
    expect((await request('/billing', fractional)).status).toBe(200);
    expect((await request('/billing', { ...bill(2), offerings: [], totalCredits: '0.00', amountYuan: '0.00' })).status).toBe(200);
    expect((await bills()).latestAmountYuan).toBe('0.00');
  });

  it.each([
    ['3.50', '439.43', '439.42'], // 439.425: half-up, not truncation or half-even.
    ['3.49', '438.17', '438.16'], // 438.1695: above the half-cent boundary.
    ['3.51', '440.68', '440.69'], // 440.6805: below the half-cent boundary, not ceiling.
  ])('rounds the %s-credit total at 125.55 yuan to cents once using half-up', async (credits, expectedAmount, wrongAmount) => {
    const payload = { ...bill(), offerings: [{ ...bill().offerings[0]!, credits }],
      totalCredits: credits, pricePerCreditYuan: '125.55', amountYuan: expectedAmount };
    const invalid = await request('/billing', { ...payload, amountYuan: wrongAmount });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: { code: 'INVALID_BILLING_PAYLOAD' } });
    expect((await bills()).acceptedBusinessIds).toEqual([]);
    const accepted = await request('/billing', payload);
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ businessId: payload.businessId, version: 1,
      outcome: 'APPLIED', latestVersion: 1 });
    expect(await bills()).toEqual({ latestVersion: 1, latestAmountYuan: expectedAmount,
      acceptedBusinessIds: [payload.businessId] });
  });

  it('rounds after summing credits instead of adding separately rounded course amounts', async () => {
    // Individual amounts 0.002 and 0.004 both round to 0.00; their total
    // 0.006 must round to 0.01. These expectations do not use the implementation.
    const payload = { ...bill(), offerings: [
      { ...bill().offerings[0]!, credits: '0.01' },
      { offeringId: 'advanced-a', courseId: 'advanced', courseName: 'Advanced', credits: '0.02' },
    ], totalCredits: '0.03', pricePerCreditYuan: '0.20', amountYuan: '0.01' };
    expect((await request('/billing', { ...payload, amountYuan: '0.00' })).status).toBe(400);
    expect((await bills()).acceptedBusinessIds).toEqual([]);
    expect((await request('/billing', payload)).status).toBe(200);
    expect((await bills()).latestAmountYuan).toBe('0.01');
  });

  it('controls dates, times, prerequisites and deletions with persisted increasing revisions', async () => {
    const update = { termId: catalog.termId, courses: structuredClone(catalog.courses), offerings: structuredClone(catalog.offerings) };
    update.courses[0]!.prerequisiteCourseIds = ['advanced'];
    update.courses[1]!.prerequisiteCourseIds = [];
    update.offerings[0]!.meetings[0]!.startMinute = 630;
    update.offerings[0]!.meetings[0]!.endMinute = 690;
    update.offerings[0]!.meetings[0]!.fromDate = '2026-11-01';
    update.offerings = update.offerings.slice(0, 1);
    const response = await request('/control/catalog', update, options.controlToken!, 'PUT');
    expect(await response.json()).toEqual({ ok: true });
    expect(await (await request('/catalog/snapshot?termId=test-term')).json()).toEqual({ ...update, revision: '8' });
    await stopServer();
    await start();
    expect(await (await request('/catalog/snapshot?termId=test-term')).json()).toEqual({ ...update, revision: '8' });
    await request('/control/catalog', { ...update, offerings: [] }, options.controlToken!, 'PUT');
    expect(await (await request('/catalog/snapshot?termId=test-term')).json()).toEqual({ ...update, offerings: [], revision: '9' });
  });

  it('does not mistake an empty successful snapshot for a catalog outage', async () => {
    await request('/control/catalog', { termId: catalog.termId, courses: [], offerings: [] }, options.controlToken!, 'PUT');
    const empty = await request('/catalog/snapshot?termId=test-term');
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ termId: catalog.termId, courses: [], offerings: [], revision: '8' });
    await faults({ ...normalFaults, catalog: { mode: 'unavailable', delayMs: 0 } });
    const outage = await request('/catalog/snapshot?termId=test-term');
    expect(outage.status).toBe(503);
    expect(await outage.json()).toEqual({ error: { code: 'CATALOG_UNAVAILABLE' } });
    await faults(normalFaults);
    expect((await request('/catalog/snapshot?termId=test-term')).status).toBe(200);
  });

  it.each([
    ['dangling course', { offerings: [{ ...catalog.offerings[0]!, courseId: 'unknown' }] }],
    ['dangling prerequisite', { courses: [{ ...catalog.courses[0]!, prerequisiteCourseIds: ['unknown'] }] }],
    ['invalid day', { offerings: [{ ...catalog.offerings[0]!, meetings: [{ ...catalog.offerings[0]!.meetings[0]!, dayOfWeek: 8 }] }] }],
    ['inverted minute interval', { offerings: [{ ...catalog.offerings[0]!, meetings: [{ ...catalog.offerings[0]!.meetings[0]!, startMinute: 601 }] }] }],
    ['inverted date interval', { offerings: [{ ...catalog.offerings[0]!, meetings: [{ ...catalog.offerings[0]!.meetings[0]!, fromDate: '2027-01-01' }] }] }],
    ['invalid calendar date', { offerings: [{ ...catalog.offerings[0]!, meetings: [{ ...catalog.offerings[0]!.meetings[0]!, fromDate: '2026-02-30' }] }] }],
  ])('rejects catalog %s without incrementing revision or replacing the last good snapshot', async (_name, patch) => {
    const response = await request('/control/catalog', {
      termId: catalog.termId, courses: catalog.courses, offerings: catalog.offerings, ...patch,
    }, options.controlToken!, 'PUT');
    expect(response.status).toBe(400);
    expect(await (await request('/catalog/snapshot?termId=test-term')).json()).toEqual(catalog);
  });

  it('returns unavailable without accepting and resumes normal delivery after recovery', async () => {
    await faults({ ...normalFaults, billing: { mode: 'unavailable', delayMs: 0 } });
    expect((await request('/billing', bill())).status).toBe(503);
    expect((await bills()).acceptedBusinessIds).toEqual([]);
    await faults(normalFaults);
    expect((await (await request('/billing', bill())).json()).outcome).toBe('APPLIED');
  });

  it('rejects incomplete or unsafe fault controls without changing active modes', async () => {
    for (const invalid of [
      { billing: normalFaults.billing },
      { ...normalFaults, catalog: { mode: 'unavailable', delayMs: -1 } },
      { ...normalFaults, billing: { mode: 'normal', delayMs: 2147483648 } },
      { ...normalFaults, billing: { mode: 'unknown', delayMs: 0 } },
    ]) {
      expect((await request('/control/faults', invalid, options.controlToken!, 'PUT')).status).toBe(400);
    }
    expect((await request('/catalog/snapshot?termId=test-term')).status).toBe(200);
    expect((await request('/billing', bill())).status).toBe(200);
  });

  it('does not acknowledge a failed atomic file write and retains prior bills after repaired-path restart', async () => {
    expect((await request('/billing', bill())).status).toBe(200);
    const saved = `${options.statePath}.saved`;
    await rename(options.statePath, saved);
    await mkdir(options.statePath);
    const failed = await request('/billing', newerBill());
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: { code: 'SIMULATOR_UNAVAILABLE' } });
    expect((await request('/control/bills?termId=test-term&studentId=student-a', undefined, options.controlToken!)).status).toBe(503);
    expect(JSON.parse(await readFile(saved, 'utf8')).messages).toEqual([bill()]);
    await stopServer();
    await rm(options.statePath, { recursive: true });
    await rename(saved, options.statePath);
    await start();
    expect(await bills()).toEqual({ latestVersion: 1, latestAmountYuan: '1200.00', acceptedBusinessIds: [bill().businessId] });
    expect((await (await request('/billing', newerBill())).json()).outcome).toBe('APPLIED');
    expect((await bills()).latestAmountYuan).toBe('1500.00');
  });

  it('forces actual catalog and billing client deadlines, even with delayMs zero', async () => {
    await faults({ catalog: { mode: 'timeout', delayMs: 0 }, billing: { mode: 'timeout', delayMs: 0 } });
    const started = performance.now();
    const results = await Promise.allSettled([
      fetch(`${baseUrl}/catalog/snapshot?termId=test-term`, {
        headers: { Authorization: `Bearer ${options.externalToken}` }, signal: AbortSignal.timeout(8000),
      }),
      fetch(`${baseUrl}/billing`, {
        method: 'POST', body: JSON.stringify(bill()), signal: AbortSignal.timeout(5000),
        headers: { Authorization: `Bearer ${options.externalToken}`, 'Content-Type': 'application/json' },
      }),
    ]);
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(performance.now() - started).toBeGreaterThanOrEqual(7900);
    await faults(normalFaults);
    expect((await request('/catalog/snapshot?termId=test-term')).status).toBe(200);
  }, 15000);

  it('drops the real connection only after durable accept and deduplicates after a fresh process restart', async () => {
    await stopServer();
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = (reservation.address() as AddressInfo).port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    baseUrl = `http://127.0.0.1:${port}`;
    await startChild(port);
    await faults({ ...normalFaults, billing: { mode: 'drop-after-accept', delayMs: 0 } });
    await expect(request('/billing', newerBill())).rejects.toThrow();
    // Reading the file immediately after the failed HTTP proves accept was
    // durably committed before the connection dropped, not scheduled later.
    const disk = JSON.parse(await readFile(options.statePath, 'utf8'));
    expect(disk.messages).toEqual([newerBill()]);
    const exited = once(child!, 'exit');
    child!.kill('SIGKILL');
    await exited;
    await startChild(port);
    expect(await (await request('/billing', newerBill())).json()).toEqual({
      businessId: newerBill().businessId, version: 2, outcome: 'DUPLICATE', latestVersion: 2,
    });
    expect(await (await request('/billing', bill())).json()).toEqual({
      businessId: bill().businessId, version: 1, outcome: 'STALE', latestVersion: 2,
    });
    expect((await bills()).latestAmountYuan).toBe('1500.00');
    expect((await bills()).acceptedBusinessIds).toHaveLength(2);
  }, 15000);

  it('fails startup on missing seed or corrupt persisted state instead of quietly resetting', async () => {
    await stopServer();
    await expect(createSimulatorApp({ ...options, seedPath: join(directory, 'missing.json') })).rejects.toThrow();
    await writeFile(options.seedPath, JSON.stringify({ catalogs: [{ ...catalog, revision: '1.0' }] }));
    await expect(createSimulatorApp(options)).rejects.toThrow('Seed revision');
    await writeFile(options.seedPath, JSON.stringify({ catalogs: [catalog] }));
    await writeFile(options.statePath, '{broken');
    await expect(createSimulatorApp(options)).rejects.toThrow();
    expect(await readFile(options.statePath, 'utf8')).toBe('{broken');
  });

  it('logs route templates and outcomes without bodies, tokens, student names, grades or SSN', async () => {
    await stopServer();
    const events: unknown[] = [];
    await start({ log: (event) => events.push(event) });
    await request('/billing', bill());
    await request('/billing', { ...bill(), grade: 'SECRET_GRADE', ssn: 'SECRET_SSN' });
    await request('/control/bills?termId=test-term&studentId=student-a', undefined, options.controlToken!);
    const logged = JSON.stringify(events);
    for (const sensitive of [options.externalToken, options.controlToken!, bill().studentName, 'SECRET_GRADE', 'SECRET_SSN']) {
      expect(logged).not.toContain(sensitive);
    }
    expect(events).toHaveLength(3);
    expect(logged).toContain('/billing');
    expect(logged).not.toContain('studentId=');
  });
});
