import assert from 'node:assert/strict';
import { get } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { platform, release } from 'node:os';
import { startLoadProcess } from './process.js';

const output = resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) ?? '.amp/in/artifacts/tcp-control.json');
const linux = async (path: string) => platform() === 'linux' ? (await readFile(path, 'utf8')).trim() : null;
const counters = async () => {
  const text = await linux('/proc/net/netstat');
  if (!text) return null;
  const lines = text.split('\n'); const fields = lines[0]!.split(/\s+/); const values = lines[1]!.split(/\s+/);
  return Object.fromEntries(['ListenOverflows', 'ListenDrops', 'TCPReqQFullDoCookies', 'TCPReqQFullDrop'].map(key => [key, Number(values[fields.indexOf(key)])]));
};
const results = [];
for (const implementation of ['node', 'hono'] as const) for (const rampMs of [0, 2000]) {
  const server = await startLoadProcess({ mode: 'tcp', implementation });
  const before = await counters(); const started = performance.now();
  try {
    const responses = await Promise.all(Array.from({ length: 2000 }, async (_, index) => {
      if (rampMs) await new Promise(resolveWait => setTimeout(resolveWait, index * rampMs / 2000));
      return new Promise<string>(resolveResult => {
        const request = get(server.origin, { agent: false }, response => {
          let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
          response.on('end', () => resolveResult(response.statusCode === 200 && body === '{"ok":true}' ? 'ok' : 'BAD_RESPONSE'));
          response.on('error', error => resolveResult((error as NodeJS.ErrnoException).code ?? 'RESPONSE_ERROR'));
        });
        request.on('error', error => resolveResult((error as NodeJS.ErrnoException).code ?? 'REQUEST_ERROR'));
        request.setTimeout(10_000, () => { request.destroy(); resolveResult('TIMEOUT'); });
      });
    }));
    const errors: Record<string, number> = {};
    for (const response of responses.filter(value => value !== 'ok')) errors[response] = (errors[response] ?? 0) + 1;
    const after = await counters();
    const result = { implementation, rampMs, connections: 2000, connectionReuse: false, successful: responses.filter(value => value === 'ok').length,
      errors, wallMs: performance.now() - started, tcpCounterDelta: before && after ? Object.fromEntries(Object.entries(after).map(([key, value]) => [key, value - before[key]!])) : null };
    results.push(result); console.log(JSON.stringify(result));
    if (result.successful !== 2000) process.exitCode = 1;
  } finally { await server.stop(); }
}
assert.equal(results.length, 4);
await mkdir(resolve(output, '..'), { recursive: true });
await writeFile(output, JSON.stringify({ generatedAt: new Date().toISOString(), os: `${platform()} ${release()}`, node: process.version,
  somaxconn: await linux('/proc/sys/net/core/somaxconn'), tcpMaxSynBacklog: await linux('/proc/sys/net/ipv4/tcp_max_syn_backlog'),
  fileLimits: (await linux('/proc/self/limits'))?.split('\n').find(line => line.startsWith('Max open files')),
  topology: 'HTTP client and server in separate processes on the same host; no database; default Node listen backlog', results }, null, 2) + '\n', { mode: 0o600 });
