# US-018 NFR-01—03 load runner

The runner uses the acceptance fixture's disposable PostgreSQL database and real catalog/billing simulator, starts the real runtime workers and exposes the Hono application through a temporary real HTTP listener. Each authenticated virtual user owns four registrations and six legal choices. At most ten users share a six-offering group, and submit transactions exchange the fourth registration between two valid offerings, so submissions exercise successful transactional work without competing for an already-full class.

Full serial run (5-minute warm-up plus 30-minute steady phase at each scale):

```sh
node --env-file-if-exists=.env node_modules/tsx/dist/cli.mjs tests/load/nfr01-03.ts --users=500,2000 --output=.amp/in/artifacts/load-full.json
```

Tool smoke (shortened phases and think time; **not** NFR evidence):

```sh
node --env-file-if-exists=.env node_modules/tsx/dist/cli.mjs tests/load/nfr01-03.ts --users=10 --warmup-seconds=2 --steady-seconds=5 --think-min-ms=10 --think-max-ms=30 --output=.amp/in/artifacts/load-smoke.json
```

Defaults are `--warmup-seconds=300`, `--steady-seconds=1800`, `--think-min-ms=5000`, `--think-max-ms=15000`, `--timeout-seconds=120`, and `--seed=1803`. Results include every steady-phase transaction initiated (failed and timed-out requests remain in the denominator), NFR ratios, latency percentiles, error codes, active-user/resource samples, actual phase times, environment/topology, catalog size, and post-run database invariants.

For a diagnostic reproduction, add `--diagnostics=true`. Test-side wrappers measure catalog queue wait, real external HTTP, transaction connection/lock wait, and transaction body time. The report also includes server response totals, sanitized client exception names/codes/syscalls, event-loop delay, and five-second PostgreSQL activity samples through a separate observer connection. These probes add overhead and aggregate warmup, steady and client/server drain together; they are not steady-only NFR metrics. No product locks, timeouts or pool settings are changed.

`--ramp-seconds=20` spreads virtual users' first requests across 20 seconds **inside warmup**. All users remain active for the steady phase; think times, operation weights and error denominators do not change. Ramp must not exceed warmup. The default is zero to preserve the original simultaneous-start reproduction. Record this parameter when comparing runs: on macOS, a synchronized connection burst can overflow the loopback listener's TCP accept queue even for an HTTP server with no database.

For example, the following is a short diagnostic, **not** a replacement for the full-duration acceptance run. Seed `1001806` reproduces the original second scale's workload sequence:

```sh
npm run test:load -- --users=2000 --warmup-seconds=30 --steady-seconds=180 --ramp-seconds=20 --seed=1001806 --diagnostics=true --output=.amp/in/artifacts/load-2000-ramped-diagnostic.json
```

The process exits nonzero if a scale aborts, any final invariant fails, fewer than 80% of initiated transactions succeed within 120 seconds, or any catalog request fails/exceeds 10 seconds. Empty measurements fail. JSON is still written so failures remain inspectable. This exit gate was added after the first full run; that run's exit code alone is not acceptance evidence.

Before validating registrations, the runner stops runtime polling and drains admitted server operations. Client timeout alone does not mean a write stopped: `phases.serverDrain` records this extra wait, and a late server success never changes the original failed client sample into a success. Older reports without this phase sampled invariants before server drain and must not be described as quiescent final state.

The tool reports process CPU and host memory, not PostgreSQL/simulator per-process CPU. It is a single-host topology and does not emulate network latency. A full two-scale run has 70 minutes of measured phases plus account/data setup, login, final in-flight think/request completion, validation, and cleanup; reserve additional setup time, especially for 2,000 password logins.
