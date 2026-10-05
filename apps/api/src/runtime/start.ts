import { Client } from 'pg';
import type { createApplication } from '../app.js';

export type Application = ReturnType<typeof createApplication>;
export async function recover(application: Application) {
  const { runtime } = application;
  await runtime.transaction([], async tx => {
    const terms = await tx.term.findMany();
    if (terms.filter(t => t.isLaunchTerm).length !== 1) throw new Error('Exactly one launch term is required');
    for (const term of terms) {
      if (term.closeState === 'CLOSING') {
        await tx.term.update({ where: { id: term.id }, data: { closeState: 'OPEN', closeAttemptId: null, lastCloseError: { code: 'RECOVERED_INTERRUPTED_CLOSE', message: '进程中断，关闭事务未完成；请重新发起关闭' }, version: { increment: 1 } } });
        await runtime.audit(tx, null, 'close.recover', 'Term', term.id);
        runtime.gates.set(term.id, 'OPEN');
      } else runtime.gates.set(term.id, term.closeState);
    }
    const now = await runtime.now(tx);
    await tx.billingOutbox.updateMany({ where: { status: 'IN_FLIGHT', leaseUntil: { lte: now } }, data: { status: 'RETRY', leaseUntil: null, lastErrorCode: 'LEASE_EXPIRED' } });
  });
}

export async function startRuntime(application: Application, databaseUrl: string, onLeadershipLost: () => void) {
  const { runtime, catalog, billing } = application;
  const leader = new Client({ connectionString: databaseUrl, keepAlive: true, connectionTimeoutMillis: 5000 });
  let stopped = false; let catalogPolling = false; let heartbeating = false;
  const lost = () => {
    if (stopped) return;
    runtime.ready = false;
    runtime.log({ errorCode: 'LEADERSHIP_LOST' });
    onLeadershipLost();
  };
  leader.on('error', lost); leader.on('end', lost);
  await leader.connect();
  const result = await leader.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(710000::bigint) AS locked');
  if (!result.rows[0]?.locked) { stopped = true; await leader.end(); throw new Error('Another API instance owns this database'); }
  try { await recover(application); }
  catch (error) { stopped = true; await leader.end(); throw error; }
  runtime.ready = true;
  const heartbeat = setInterval(() => {
    if (heartbeating || stopped) return; heartbeating = true;
    void leader.query('SELECT 1').catch(lost).finally(() => { heartbeating = false; });
  }, 1000);
  const pollCatalog = async () => {
    if (catalogPolling || stopped || !runtime.ready) return; catalogPolling = true;
    try {
      const terms = await runtime.db.term.findMany({ where: { closeState: 'OPEN' } });
      await Promise.all(terms.filter(t => runtime.gates.status(t.id) === 'OPEN').map(async term => {
        try { await catalog.fresh(term.id); } catch { runtime.log({ termId: term.id, errorCode: 'CATALOG_SYNC_FAILED' }); }
      }));
    } catch { runtime.log({ errorCode: 'BACKGROUND_FAILED' }); }
    finally { catalogPolling = false; }
  };
  const pollBilling = async () => {
    if (stopped || !runtime.ready) return;
    try { await billing.tick(); } catch { runtime.log({ errorCode: 'BILLING_WORKER_FAILED' }); }
  };
  const catalogTimer = setInterval(() => { runtime.spawn(pollCatalog()); }, 1000);
  const billingTimer = setInterval(() => { runtime.spawn(pollBilling()); }, 1000);
  runtime.spawn(pollCatalog()); runtime.spawn(pollBilling());
  return async () => {
    stopped = true; runtime.ready = false; clearInterval(catalogTimer); clearInterval(billingTimer); clearInterval(heartbeat);
    const terms = await runtime.db.term.findMany();
    for (const term of terms) if (runtime.gates.status(term.id) === 'OPEN') runtime.gates.set(term.id, 'CLOSING');
    await Promise.all(terms.map(t => runtime.gates.drain(t.id))); await runtime.settle();
    await leader.end();
  };
}
