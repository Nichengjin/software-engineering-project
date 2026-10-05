import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const tsx = require.resolve('tsx/cli');
const vite = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js');

// Build shared runtime exports before starting application watchers.
for (const workspace of ['@wylie/contracts', '@wylie/db']) {
  const child = spawn('npm', ['run', 'build', '-w', workspace], { stdio: 'inherit' });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  if (code !== 0) process.exit(code ?? 1);
}
const env = { ...process.env, PUBLIC_ORIGIN: process.env.PUBLIC_URL || process.env.PUBLIC_ORIGIN };
const children = [
  spawn(process.execPath, [tsx, 'watch', 'src/server.ts'], { cwd: join(root, 'apps/api'), stdio: 'inherit', env: { ...env, PORT: env.API_PORT || '3000' } }),
  spawn(process.execPath, [vite, '--host', '0.0.0.0', '--port', env.PORT || '5173', '--strictPort'], { cwd: join(root, 'apps/web'), stdio: 'inherit', env }),
  spawn(process.execPath, [tsx, 'watch', 'src/index.ts'], {
    cwd: join(root, 'apps/simulators'), stdio: 'inherit',
    env: { ...env, PORT: env.SIM_PORT || '3001', SIM_PORT: env.SIM_PORT || '3001', SIM_SEED_PATH: resolve(root, env.SIM_SEED_PATH || 'packages/db/seed/catalog.json'), SIM_STATE_PATH: resolve(root, env.SIM_STATE_PATH || 'tmp/simulators-state.json') },
  }),
];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
for (const child of children) child.on('exit', (code) => stop(code ?? 1));
