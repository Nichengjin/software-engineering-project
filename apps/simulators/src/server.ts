import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { serve } from '@hono/node-server';
import { createSimulatorApp, type SimulatorOptions } from './app.js';

export async function startSimulatorServer(options: SimulatorOptions, port = 3001) {
  const app = await createSimulatorApp(options);
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port });
  if (!server.listening) await once(server, 'listening');
  return server;
}

export async function main() {
  const port = Number(process.env['SIM_PORT'] ?? '3001');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SIM_PORT');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const server = await startSimulatorServer({
    seedPath: resolve(root, process.env['SIM_SEED_PATH'] ?? 'packages/db/seed/catalog.json'),
    statePath: resolve(root, process.env['SIM_STATE_PATH'] ?? 'tmp/simulators-state.json'),
    externalToken: process.env['EXTERNAL_SERVICE_TOKEN'] ?? '',
    controlEnabled: process.env['SIM_CONTROL_ENABLED'] === 'true',
    ...(process.env['SIM_CONTROL_TOKEN'] ? { controlToken: process.env['SIM_CONTROL_TOKEN'] } : {}),
    log: (event) => console.info(JSON.stringify(event)),
  }, port);
  console.info(JSON.stringify({ processName: 'simulators', event: 'listening', port }));
  const shutdown = () => {
    server.close();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
