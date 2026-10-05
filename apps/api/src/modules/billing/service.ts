import type { BillingOutbox, Student, Term } from '@prisma/client';
import { Runtime, type Tx, type Actor, json } from '../../runtime/context.js';
import type { BillingPayload } from '../../runtime/external.js';
import { tuition } from '../../rules.js';

export const billingView = (b: BillingOutbox) => ({ studentId: b.studentId, termId: b.termId, version: b.version, businessId: b.businessId, amountYuan: b.amountYuan.toFixed(2), status: b.status, attempts: b.attempts, nextAttemptAt: ['ACKNOWLEDGED', 'SUPERSEDED'].includes(b.status) ? null : b.nextAttemptAt.toISOString(), lastErrorCode: b.lastErrorCode });
export class BillingService {
  private running = false;
  constructor(readonly rt: Runtime) {}
  async create(tx: Tx, student: Student, term: Term, offerings: BillingPayload['offerings'], actor: Actor | null) {
    const prior = await tx.billingOutbox.findFirst({ where: { studentId: student.id, termId: term.id }, orderBy: { version: 'desc' } });
    const version = (prior?.version ?? 0) + 1; const businessId = `${term.id}:${student.id}:${version}`;
    const price = term.pricePerCreditYuan?.toFixed(2) ?? this.rt.config.pricePerCreditYuan;
    const payload: BillingPayload = { businessId, studentId: student.id, studentNumber: student.studentNumber, studentName: student.name, termId: term.id, version, closedAt: term.closedAt!.toISOString(), offerings, pricePerCreditYuan: price, ...tuition(offerings.map(o => o.credits), price) };
    await tx.billingOutbox.updateMany({ where: { studentId: student.id, termId: term.id, status: { not: 'SUPERSEDED' } }, data: { status: 'SUPERSEDED', leaseUntil: null } });
    const row = await tx.billingOutbox.create({ data: { studentId: student.id, termId: term.id, version, businessId, payload: json(payload), amountYuan: payload.amountYuan, nextAttemptAt: await this.rt.now(tx) } });
    await this.rt.audit(tx, actor, 'billing.enqueue', 'BillingOutbox', row.id);
    return row;
  }
  async summary(termId: string) {
    const rows = await this.rt.db.billingOutbox.findMany({ where: { termId } });
    return { pending: rows.filter(r => ['PENDING','RETRY','IN_FLIGHT'].includes(r.status)).length, acknowledged: rows.filter(r => r.status === 'ACKNOWLEDGED').length, superseded: rows.filter(r => r.status === 'SUPERSEDED').length };
  }
  async tick() {
    if (this.running) return; this.running = true;
    try {
      const now = await this.rt.now();
      await this.rt.db.billingOutbox.updateMany({ where: { status: 'IN_FLIGHT', leaseUntil: { lte: now } }, data: { status: 'RETRY', leaseUntil: null, lastErrorCode: 'LEASE_EXPIRED' } });
      const due = await this.rt.db.billingOutbox.findMany({ where: { status: { in: ['PENDING','RETRY'] }, nextAttemptAt: { lte: now } }, orderBy: { nextAttemptAt: 'asc' }, take: 50 });
      for (let offset = 0; offset < due.length; offset += 8) {
        // Wait for every started send, including fault hooks, before releasing the
        // busy flag. A rejected Promise.all must not strand untracked send tasks.
        const results = await Promise.allSettled(due.slice(offset, offset + 8).map(row => this.send(row)));
        const failed = results.find(r => r.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
      }
    } finally { this.running = false; }
  }
  private async send(row: BillingOutbox) {
    const claimedAt = await this.rt.now();
    const claim = await this.rt.db.billingOutbox.updateMany({ where: { id: row.id, status: { in: ['PENDING','RETRY'] } }, data: { status: 'IN_FLIGHT', attempts: { increment: 1 }, leaseUntil: new Date(claimedAt.getTime() + 15000), nextAttemptAt: new Date(claimedAt.getTime() + 60000) } });
    if (!claim.count) return;
    try { await this.rt.external.bill(row.payload as unknown as BillingPayload); }
    catch {
      await this.rt.db.$transaction(async tx => {
        await tx.billingOutbox.updateMany({ where: { id: row.id, status: 'IN_FLIGHT' }, data: { status: 'RETRY', leaseUntil: null, nextAttemptAt: new Date((await this.rt.now(tx)).getTime() + 60000), lastErrorCode: 'BILLING_UNAVAILABLE' } });
        await this.rt.audit(tx, null, 'billing.send', 'BillingOutbox', row.id, 'FAILED', 'BILLING_UNAVAILABLE');
      }); return;
    }
    await this.rt.hook('billing.afterSendBeforeAckPersist');
    await this.rt.db.$transaction(async tx => {
      await tx.billingOutbox.updateMany({ where: { id: row.id, version: row.version, status: 'IN_FLIGHT' }, data: { status: 'ACKNOWLEDGED', acknowledgedAt: await this.rt.now(tx), leaseUntil: null, lastErrorCode: null } });
      await this.rt.audit(tx, null, 'billing.send', 'BillingOutbox', row.id);
    });
  }
}
