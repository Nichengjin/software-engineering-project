import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import type { Config } from '../../apps/api/src/runtime/context.js';
import type { SimulatorOptions } from '../../apps/simulators/src/app.js';

export type WorkerOptions = { mode: 'tcp'; implementation: 'node' | 'hono' } | { mode: 'simulator'; options: SimulatorOptions } | {
  mode: 'api'; url: string; simulatorUrl: string; externalToken: string; config: Config; clock: string; diagnostic: boolean;
};
export type WorkerStats = {
  pid: number; peakRssBytes: number; cpuUserMs: number; cpuSystemMs: number;
  stages: Record<string, { count: number; failures: number; active: number; peakActive: number; p50Ms: number | null; p95Ms: number | null; maxMs: number | null }>;
  serverResponses: Record<string, number>;
  eventLoopMs: { mean: number; p99: number; max: number };
};
type Message = { event: 'ready'; origin: string } | { event: 'stopped'; stats: WorkerStats };

// Configuration (including ephemeral secrets) travels over private IPC, not argv or logs.
export async function startLoadProcess(options: WorkerOptions) {
  const child = fork(fileURLToPath(new URL('./worker.ts', import.meta.url)), [], {
    execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  // Consume stderr without exposing configuration/credentials from an exception.
  child.stderr!.resume();
  const exited = once(child, 'exit');
  let stats: WorkerStats | undefined;
  let failure: Error | undefined;
  child.on('error', error => { failure = error; });
  child.on('exit', code => { if (code !== 0) failure = new Error(`${options.mode} worker exited ${code}`); });
  child.on('message', (raw: Message) => {
    if (raw.event === 'stopped') stats = raw.stats;
  });
  let stopping: Promise<WorkerStats | undefined> | undefined;
  const stop = () => stopping ??= (async () => {
    if (child.connected) child.send({ event: 'stop' });
    const [code] = await exited;
    if (failure) throw failure;
    assert.equal(code, 0, `${options.mode} shutdown`);
    return stats;
  })();
  const ready = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${options.mode} startup deadline`)); }, 60_000);
    const cleanup = () => { clearTimeout(timer); child.off('message', message); child.off('exit', failed); child.off('error', failed); };
    const failed = () => { cleanup(); reject(new Error(`${options.mode} startup failed`)); };
    const message = (raw: Message) => {
      if (raw.event === 'ready') { cleanup(); resolve(raw.origin); }
    };
    child.on('message', message); child.once('exit', failed); child.once('error', failed);
  });
  child.send(options);
  try {
    const origin = await ready;
    return { origin, pid: child.pid!, stop };
  } catch (error) { if (child.connected) child.kill(); await exited; throw error; }
}

export async function isolatedSimulator(options: SimulatorOptions) {
  const worker = await startLoadProcess({ mode: 'simulator', options });
  return { origin: worker.origin, close: async () => { await worker.stop(); } };
}
