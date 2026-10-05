import { spawn } from 'node:child_process';
import { testDatabaseUrl } from './database-url.mjs';

const action = process.argv[2];
const commands = {
  migrate: ['prisma', 'migrate', 'deploy'],
  develop: ['prisma', 'migrate', 'dev', ...process.argv.slice(3)],
  test: ['prisma', 'migrate', 'deploy'],
  seed: ['tsx', 'prisma/seed.ts'],
};
const command = commands[action];
if (!command) throw new Error('Unknown database action');
const env = { ...process.env };
if (action === 'test') env.DATABASE_URL = testDatabaseUrl(env);
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const child = spawn('npx', ['--no-install', ...command], {
  cwd: new URL('../packages/db/', import.meta.url), stdio: 'inherit', env,
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
