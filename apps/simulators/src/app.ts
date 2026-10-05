import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import { billingMessageSchema, catalogUpdateSchema, simFaultsSchema, idSchema } from '@wylie/contracts';
import { InvalidBillingPayload, InvalidCatalogPayload, SimulatorStore, validateBilling, validateCatalogs } from './store.js';

export interface SimulatorOptions {
  seedPath: string;
  statePath: string;
  externalToken: string;
  controlEnabled?: boolean;
  controlToken?: string;
  log?: (event: { processName: string; requestId: string; route: string;
    status: number; durationMs: number; objectId?: string; outcome?: string }) => void;
}

function authorized(header: string | undefined, token: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(header ?? ''), digest(`Bearer ${token}`));
}

export async function createSimulatorApp(options: SimulatorOptions) {
  if (!options.externalToken.trim()) throw new Error('EXTERNAL_SERVICE_TOKEN is required');
  if (options.controlEnabled && (!options.controlToken?.trim() ||
      options.controlToken === options.externalToken)) {
    throw new Error('Enabled controls require a separate SIM_CONTROL_TOKEN');
  }
  const store = await SimulatorStore.load(options.statePath, options.seedPath);
  let faults = simFaultsSchema.parse({
    catalog: { mode: 'normal', delayMs: 0 }, billing: { mode: 'normal', delayMs: 0 },
  });
  const app = new Hono<{ Bindings: HttpBindings; Variables: { objectId: string; outcome: string } }>();
  app.use('*', async (context, next) => {
    const started = performance.now();
    const requestId = randomUUID();
    context.header('X-Request-ID', requestId);
    context.header('Cache-Control', 'no-store');
    await next();
    options.log?.({ processName: 'simulators', requestId,
      route: context.req.routePath, status: context.env.outgoing?.destroyed ? 0 : context.res.status,
      durationMs: Math.round(performance.now() - started), ...context.var });
  });
  app.onError((_error, context) => context.json({ error: { code: 'SIMULATOR_UNAVAILABLE' } }, 503));
  app.notFound((context) => context.json({ error: { code: 'NOT_FOUND' } }, 404));

  app.use('/catalog/*', async (context, next) => {
    if (!authorized(context.req.header('Authorization'), options.externalToken)) {
      return context.json({ error: { code: 'UNAUTHENTICATED' } }, 401);
    }
    await next();
  });
  app.use('/billing', async (context, next) => {
    if (!authorized(context.req.header('Authorization'), options.externalToken)) {
      return context.json({ error: { code: 'UNAUTHENTICATED' } }, 401);
    }
    await next();
  });
  app.use('/control/*', async (context, next) => {
    if (!options.controlEnabled) return context.json({ error: { code: 'NOT_FOUND' } }, 404);
    if (!authorized(context.req.header('Authorization'), options.controlToken!)) {
      return context.json({ error: { code: 'UNAUTHENTICATED' } }, 401);
    }
    await next();
  });

  app.get('/catalog/snapshot', async (context) => {
    const termId = idSchema.safeParse(context.req.query('termId'));
    if (!termId.success || Object.keys(context.req.query()).some((key) => key !== 'termId')) {
      return context.json({ error: { code: 'INVALID_INPUT' } }, 400);
    }
    context.set('objectId', termId.data);
    const fault = { ...faults.catalog };
    await sleep(fault.mode === 'timeout' ? Math.max(8100, fault.delayMs) : fault.delayMs);
    if (fault.mode === 'unavailable') return context.json({ error: { code: 'CATALOG_UNAVAILABLE' } }, 503);
    const snapshot = store.snapshot(termId.data);
    if (!snapshot) return context.json({ error: { code: 'NOT_FOUND' } }, 404);
    return context.json(snapshot);
  });

  app.post('/billing', async (context) => {
    const input = billingMessageSchema.safeParse(await context.req.json().catch(() => undefined));
    if (!input.success) return context.json({ error: { code: 'INVALID_BILLING_PAYLOAD' } }, 400);
    try {
      validateBilling(input.data);
    } catch {
      return context.json({ error: { code: 'INVALID_BILLING_PAYLOAD' } }, 400);
    }
    context.set('objectId', input.data.businessId);
    const fault = { ...faults.billing };
    await sleep(fault.mode === 'timeout' ? Math.max(5100, fault.delayMs) : fault.delayMs);
    if (fault.mode === 'unavailable') return context.json({ error: { code: 'BILLING_UNAVAILABLE' } }, 503);
    let ack;
    try {
      ack = await store.accept(input.data);
    } catch (error) {
      if (error instanceof InvalidBillingPayload) {
        return context.json({ error: { code: 'INVALID_BILLING_PAYLOAD' } }, 409);
      }
      throw error;
    }
    context.set('outcome', ack.outcome);
    if (fault.mode === 'drop-after-accept') {
      // HttpBindings come from the Node adapter. No successful response is sent.
      context.env.outgoing.destroy();
      return context.body(null);
    }
    return context.json(ack);
  });

  app.put('/control/faults', async (context) => {
    const input = simFaultsSchema.safeParse(await context.req.json().catch(() => undefined));
    if (!input.success) return context.json({ error: { code: 'INVALID_INPUT' } }, 400);
    faults = input.data;
    return context.json({ ok: true });
  });
  app.put('/control/catalog', async (context) => {
    const input = catalogUpdateSchema.safeParse(await context.req.json().catch(() => undefined));
    if (!input.success) return context.json({ error: { code: 'INVALID_INPUT' } }, 400);
    try {
      validateCatalogs([{ ...input.data, revision: '0' }]);
    } catch {
      return context.json({ error: { code: 'INVALID_INPUT' } }, 400);
    }
    context.set('objectId', input.data.termId);
    try {
      await store.updateCatalog(input.data);
    } catch (error) {
      if (error instanceof InvalidCatalogPayload) {
        return context.json({ error: { code: 'INVALID_INPUT' } }, 400);
      }
      throw error;
    }
    return context.json({ ok: true });
  });
  app.get('/control/bills', (context) => {
    const termId = idSchema.safeParse(context.req.query('termId'));
    const studentId = idSchema.safeParse(context.req.query('studentId'));
    if (!termId.success || !studentId.success ||
        Object.keys(context.req.query()).some((key) => !['termId', 'studentId'].includes(key))) {
      return context.json({ error: { code: 'INVALID_INPUT' } }, 400);
    }
    return context.json(store.bills(termId.data, studentId.data));
  });
  return app;
}
