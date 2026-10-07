import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { createApplication } from '../../apps/api/src/app.js';
import { httpExternal } from '../../apps/api/src/runtime/external.js';
import { startRuntime } from '../../apps/api/src/runtime/start.js';
import { startSimulatorServer } from '../../apps/simulators/src/server.js';
import type { WorkerOptions, WorkerStats } from './process.js';

const percentile = (values: number[], fraction: number) => values.length ? values[Math.ceil(values.length * fraction) - 1]! : null;
async function run(options: WorkerOptions) {
  let stopRuntime: (() => Promise<void>) | undefined;
  let db: PrismaClient | undefined;
  const loop = monitorEventLoopDelay({ resolution: 20 });
  const cpu = process.cpuUsage(); let peakRssBytes = 0;
  const stages: Record<string, { durations: number[]; failures: number; active: number; peakActive: number }> = {};
  const serverResponses: Record<string, number> = {};
  const measured = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
    const stage = stages[name] ??= { durations: [], failures: 0, active: 0, peakActive: 0 };
    stage.peakActive = Math.max(stage.peakActive, ++stage.active); const start = performance.now();
    try { return await action(); } catch (error) { stage.failures++; throw error; }
    finally { stage.active--; stage.durations.push(performance.now() - start); }
  };
  const server = await (async () => {
    if (options.mode === 'tcp') {
      if (options.implementation === 'hono') return serve({ fetch: () => Response.json({ ok: true }), port: 0, hostname: '127.0.0.1' });
      return createServer((_request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"ok":true}'); }).listen(0, '127.0.0.1');
    }
    if (options.mode === 'simulator') return startSimulatorServer(options.options, 0);
    db = new PrismaClient({ datasourceUrl: options.url });
    const application = createApplication({ db, config: options.config, clock: () => new Date(options.clock),
      external: httpExternal({ catalogBaseUrl: options.simulatorUrl, billingBaseUrl: options.simulatorUrl, externalToken: options.externalToken }),
      log: entry => {
        if (!options.diagnostic) return;
        const key = `${entry.route ?? 'background'}:${entry.status ?? entry.errorCode ?? 'unknown'}`;
        serverResponses[key] = (serverResponses[key] ?? 0) + 1;
      },
    });
    if (options.diagnostic) {
      const { runtime, catalog } = application;
      const fresh = catalog.fresh.bind(catalog); const apply = catalog.apply.bind(catalog);
      const external = runtime.external.catalog.bind(runtime.external); const transaction = runtime.transaction.bind(runtime);
      catalog.fresh = (...args) => measured('catalog.fresh.total', () => fresh(...args));
      catalog.apply = (...args) => measured('catalog.apply', () => apply(...args));
      runtime.external.catalog = (...args) => measured('catalog.external.http', () => external(...args));
      runtime.transaction = (termIds, fn) => {
        const start = performance.now();
        return measured('transaction.total', () => transaction(termIds, tx => {
          const stage = stages['transaction.connectionAndLocks'] ??= { durations: [], failures: 0, active: 0, peakActive: 0 };
          stage.durations.push(performance.now() - start);
          return measured('transaction.body', () => fn(tx));
        }));
      };
    }
    stopRuntime = await startRuntime(application, options.url, () => process.exit(1));
    return serve({ fetch: application.app.fetch, port: 0, hostname: '127.0.0.1' });
  })();
  if (!server.listening) await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  loop.enable();
  const summary = (): WorkerStats => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    const used = process.cpuUsage(cpu);
    return { pid: process.pid, peakRssBytes, cpuUserMs: used.user / 1000, cpuSystemMs: used.system / 1000,
      stages: Object.fromEntries(Object.entries(stages).map(([name, stage]) => {
        const sorted = [...stage.durations].sort((a, b) => a - b);
        return [name, { count: sorted.length, failures: stage.failures, active: stage.active, peakActive: stage.peakActive,
          p50Ms: percentile(sorted, .5), p95Ms: percentile(sorted, .95), maxMs: sorted.at(-1) ?? null }];
      })), serverResponses, eventLoopMs: { mean: loop.mean / 1e6, p99: loop.percentile(99) / 1e6, max: loop.max / 1e6 } };
  };
  // Lightweight resource samples; detailed sorting only at the end of a run.
  const sample = setInterval(() => { peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss); }, 1000);
  process.send!({ event: 'ready', origin: `http://127.0.0.1:${address.port}` });
  await new Promise<void>(resolve => process.once('message', () => resolve()));
  // Stop ingress first. Runtime drain also covers admitted work after client abort.
  const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await stopRuntime?.();
  if ('closeAllConnections' in server) server.closeAllConnections(); await closed;
  await db?.$disconnect(); clearInterval(sample); loop.disable();
  process.send!({ event: 'stopped', stats: summary() }, () => process.disconnect());
}
process.once('message', (options: WorkerOptions) => {
  void run(options).catch(() => { process.exit(1); });
});
