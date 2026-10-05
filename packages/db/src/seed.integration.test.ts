import { PrismaClient } from '@prisma/client';
import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, stat, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, expect, it } from 'vitest';
import { billingMessageSchema, closeResultSchema } from '@wylie/contracts';
import { testDatabaseUrl } from '../../../scripts/database-url.mjs';

const adminUrl = testDatabaseUrl();
const admin = new PrismaClient({ datasourceUrl: adminUrl });
afterAll(async () => { await admin.$disconnect(); });
const root = fileURLToPath(new URL('../../../', import.meta.url));
function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'pipe' });
    // Do not surface seed stderr: Prisma error formatting could include a password hash.
    child.stdout.resume(); child.stderr.resume();
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Isolated seed command failed (${code}); credentials suppressed`)));
  });
}

it('seeds a fresh disposable test database once, preserves credentials, and matches passwords/outbox to fixtures', async () => {
  const suffix = randomUUID().replaceAll('-', '');
  const name = `wylie_seed_${suffix}_test`;
  const url = new URL(adminUrl); url.pathname = `/${name}`;
  const credentialPath = `.local/seed-${suffix}-credentials.json`;
  const env = { ...process.env, DATABASE_URL: url.toString(), DEMO_CREDENTIALS_PATH: credentialPath };
  const db = new PrismaClient({ datasourceUrl: url.toString() });
  // This is a newly created, randomly named _test DB, never an existing DB or reset target.
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  try {
    await run('npx', ['--no-install', 'prisma', 'migrate', 'deploy', '--schema', 'packages/db/prisma/schema.prisma'], env);
    await run('npx', ['--no-install', 'tsx', 'packages/db/prisma/seed.ts'], env);
    const credentialUrl = new URL(`../../../${credentialPath}`, import.meta.url);
    const before = await readFile(credentialUrl, 'utf8');
    await run('npx', ['--no-install', 'tsx', 'packages/db/prisma/seed.ts'], env);
    expect(await readFile(credentialUrl, 'utf8')).toBe(before);
    expect((await stat(credentialUrl)).mode & 0o777).toBe(0o600);
    const credentials = (JSON.parse(before) as { credentials: Array<{ account: string; initialPassword: string }> }).credentials;
    expect(credentials).toHaveLength(19);
    expect(new Set(credentials.map((c) => c.initialPassword)).size).toBe(19);
    const accounts = await db.account.findMany();
    expect(accounts).toHaveLength(19);
    for (const account of accounts) {
      const raw = credentials.find((c) => c.account === account.account)!;
      const [algorithm, n, r, p, saltHex, expectedHex] = account.passwordHash.split('$');
      expect([algorithm, n, r, p]).toEqual(['scrypt', '16384', '8', '1']);
      expect(Buffer.from(saltHex!, 'hex')).toHaveLength(16);
      const computed = scryptSync(raw.initialPassword, Buffer.from(saltHex!, 'hex'), 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
      expect(timingSafeEqual(computed, Buffer.from(expectedHex!, 'hex'))).toBe(true);
      expect(account.mustChangePassword).toBe(true);
    }
    expect(await db.student.count()).toBe(14); expect(await db.professor.count()).toBe(4);
    expect(await db.personIdentity.count()).toBe(18);
    expect(await db.term.count({ where: { isLaunchTerm: true } })).toBe(1);
    const current = await db.term.findUniqueOrThrow({ where: { ordinal: 3 } });
    expect(await db.schedule.count({ where: { termId: current.id, exists: false, version: 0 } })).toBe(14);
    expect(await db.registration.count({ where: { offering: { termId: current.id } } })).toBe(0);
    const previous = await db.term.findUniqueOrThrow({ where: { ordinal: 2 } });
    expect(closeResultSchema.parse(previous.closeResult).billing.pending).toBe(14);
    const bills = await db.billingOutbox.findMany({ where: { termId: previous.id } });
    expect(bills).toHaveLength(14);
    expect(bills.filter((b) => b.amountYuan.equals(0))).toHaveLength(4);
    expect(bills.filter((b) => b.amountYuan.equals(300))).toHaveLength(10);
    for (const bill of bills) expect(billingMessageSchema.parse(bill.payload).amountYuan).toBe(bill.amountYuan.toFixed(2));
  } finally {
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`);
    await unlink(new URL(`../../../${credentialPath}`, import.meta.url)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
  }
}, 60_000);
