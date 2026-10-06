# US-018 browser runner

Runs the built web application against an isolated `createFixture()` database and a real local Google Chrome via `agent-browser`. It does not start Vite or a development server.

```bash
node --env-file=.env node_modules/tsx/dist/cli.mjs tests/e2e/browser-runner.ts
```

Prerequisites: PostgreSQL configured as required by the acceptance fixture, built `apps/web/dist`, `agent-browser` 0.33.2+, and Google Chrome at the standard macOS path. Results and redacted screenshots are written to `.amp/in/artifacts/browser-us018/`. Initial passwords are hidden before screenshots. The runner always closes Chrome, the temporary HTTP listener, simulator, and disposable database in `finally` blocks.

The checks are named for the exact browser branch they execute; an AC label is not a claim that every subscenario in that AC is covered. In addition to the six event-to-DOM paths with ten samples each, the runner exercises two real same-account pages for stale drafts and Chrome's offline mode for disconnect/reconnect. Fixture setup may create historical grades and boundary populations, but timed changes and user actions go through business HTTP or the simulator control API. Destructive schedule and status scenarios run after the NFR-10 timing loop so they cannot alter its population.

Some controls use DOM clicks scoped to the open dialog, and date inputs use the native value setter plus input/change events to accommodate this browser driver's date-fill behavior. These checks do not verify every native pointer or calendar-picker interaction. The closure screenshot waits for both database acknowledgments and the rendered acknowledgment count, not just the first billing batch.

Still outside this local runner: Windows/Edge and independent-machine execution, human visual review/sign-off, deterministic simultaneous-click races, process-crash recovery, and exhaustive route/role or AC subscenario matrices. Use `docs/testing/acceptance-execution.md` as the execution ledger; do not infer coverage from result count alone.
