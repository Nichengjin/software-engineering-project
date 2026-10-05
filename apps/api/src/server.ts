import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import { createApplication } from './app.js';
import { httpExternal } from './runtime/external.js';
import { startRuntime } from './runtime/start.js';
import { decimalHundredths } from './rules.js';

const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing configuration: ${name}`); return value; };
const key = (name: string) => { const value = required(name); if (value.length < 32) throw new Error(`${name} must be at least 32 characters`); return value; };
const databaseUrl = required('DATABASE_URL'); const price = process.env.PRICE_PER_CREDIT_YUAN ?? '100.00'; decimalHundredths(price);
const publicOrigin = new URL(process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173').origin;
const db = new PrismaClient();
const application = createApplication({ db, external: httpExternal({ catalogBaseUrl: process.env.CATALOG_BASE_URL ?? 'http://127.0.0.1:3001', billingBaseUrl: process.env.BILLING_BASE_URL ?? 'http://127.0.0.1:3001', externalToken: required('EXTERNAL_SERVICE_TOKEN') }), config: { publicOrigin, secureCookie: publicOrigin.startsWith('https:'), csrfSigningKey: key('CSRF_SIGNING_KEY'), impactSigningKey: key('IMPACT_SIGNING_KEY'), pricePerCreditYuan: price } });
const stopRuntime = await startRuntime(application, databaseUrl, () => { process.exit(1); });
if (process.env.NODE_ENV === 'production') {
  const root = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  application.app.use('*', serveStatic({ root }));
  application.app.get('*', serveStatic({ path: `${root}index.html` }));
}
const server = serve({ fetch: application.app.fetch, port: Number(process.env.API_PORT ?? 3000), hostname: '0.0.0.0' });
let stopping = false;
for (const signal of ['SIGTERM','SIGINT'] as const) process.on(signal, () => {
  if (stopping) return; stopping = true;
  server.close(() => { void stopRuntime().then(() => db.$disconnect()).then(() => process.exit(0)).catch(() => process.exit(1)); });
});
