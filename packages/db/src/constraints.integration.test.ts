import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../../../scripts/database-url.mjs';

const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
afterAll(async () => { await db.$disconnect(); });
const empty = { primaryOfferingIds: [], alternateOfferingIds: [] };
const rollback = new Error('test-only rollback');
async function student(tx: Prisma.TransactionClient, ssn = randomUUID()) {
  const row = await tx.student.create({ data: { name: 'Fictional test student', birthDate: new Date('2004-02-29'), ssn } });
  await tx.personIdentity.create({ data: { ssn, studentId: row.id } });
  return row;
}
async function term(tx: Prisma.TransactionClient) {
  return tx.term.create({ data: { name: 'Disposable test term', ordinal: -1001, startsAt: new Date('2026-09-01'), endsAt: new Date('2027-01-01'), teachingStartsAt: new Date('2026-07-01'), initialStartsAt: new Date('2026-08-01'), initialEndsAt: new Date('2026-08-15'), addDropStartsAt: new Date('2026-08-16'), addDropEndsAt: new Date('2026-08-31') } });
}
async function isolated(run: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await db.$transaction(async (tx) => { await run(tx); await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`; throw rollback; });
  } catch (error) { if (error !== rollback) throw error; }
}

describe('SQL invariants on real PostgreSQL 15', () => {
  it('requires a matching global identity at COMMIT, not just an application pre-check', async () => {
    await expect(db.student.create({ data: { name: 'No identity', birthDate: new Date('2000-01-01'), ssn: randomUUID() } })).rejects.toThrow('person identity consistency');
    await expect(db.$transaction(async (tx) => {
      const s = await tx.student.create({ data: { name: 'Mismatched identity', birthDate: new Date('2000-01-01'), ssn: randomUUID() } });
      await tx.personIdentity.create({ data: { studentId: s.id, ssn: randomUUID() } });
    })).rejects.toThrow('person identity consistency');
    await expect(db.personIdentity.create({ data: { ssn: randomUUID() } })).rejects.toThrow('PersonIdentity_exactly_one_person');
  });
  it('allows related creation in one transaction and protects identity deletion', async () => {
    await isolated(async (tx) => { const s = await student(tx); expect(s.studentNumber).toMatch(/^S\d{6}$/); });
    await expect(db.$transaction(async (tx) => {
      const s = await student(tx);
      await tx.personIdentity.delete({ where: { ssn: s.ssn } });
    })).rejects.toThrow('person identity consistency');
  });
  it('arbitrates concurrent cross-role SSN claims with exactly one winner', async () => {
    const ssn = randomUUID();
    const results = await Promise.allSettled([
      db.$transaction(async (tx) => { const s = await student(tx, ssn); return { studentId: s.id }; }),
      db.$transaction(async (tx) => {
        const p = await tx.professor.create({ data: { name: 'Fictional test professor', birthDate: new Date('1980-01-01'), ssn, department: 'Test' } });
        await tx.personIdentity.create({ data: { ssn, professorId: p.id } });
        return { professorId: p.id };
      }),
    ]);
    try {
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await db.personIdentity.count({ where: { ssn } })).toBe(1);
      expect(await db.student.count({ where: { ssn } }) + await db.professor.count({ where: { ssn } })).toBe(1);
    } finally {
      // Remove only this test's generated identities, never reset or touch shared/seed data.
      await db.$transaction(async (tx) => { await tx.personIdentity.deleteMany({ where: { ssn } }); await tx.student.deleteMany({ where: { ssn } }); await tx.professor.deleteMany({ where: { ssn } }); });
    }
  });
  it('rejects role mismatches and preserves a schedule tombstone/version', async () => {
    await expect(db.account.create({ data: { account: randomUUID(), role: 'STUDENT', passwordHash: 'test-only' } })).rejects.toThrow('Account_role_person_check');
    await isolated(async (tx) => {
      const s = await student(tx); const t = await term(tx);
      const row = await tx.schedule.create({ data: { studentId: s.id, termId: t.id, version: 7, savedChoices: empty } });
      expect(row.exists).toBe(false); expect(row.version).toBe(7); expect(row.submittedChoices).toBeNull();
      await tx.schedule.update({ where: { id: row.id }, data: { exists: true, version: 8, savedChoices: { primaryOfferingIds: ['one'], alternateOfferingIds: ['two'] } } });
      await tx.schedule.update({ where: { id: row.id }, data: { exists: false, version: 9, savedChoices: empty, submittedChoices: Prisma.DbNull, firstSubmittedAt: null } });
      expect((await tx.schedule.findUniqueOrThrow({ where: { id: row.id } })).version).toBe(9);
    });
    await expect(db.$transaction(async (tx) => {
      const s = await student(tx); const t = await term(tx);
      await tx.schedule.create({ data: { studentId: s.id, termId: t.id, exists: false, savedChoices: { primaryOfferingIds: ['one'], alternateOfferingIds: [] } } });
    })).rejects.toThrow('Schedule_tombstone_empty');
  });
  it('allows removed history, but cannot create two effective registrations', async () => {
    await expect(db.$transaction(async (tx) => {
      const s = await student(tx); const t = await term(tx);
      const o = await tx.offering.create({ data: { externalOfferingId: randomUUID(), courseId: 'fictional-course', termId: t.id } });
      for (const state of ['REMOVED', 'REMOVED', 'ENROLLED', 'COMMITTED'] as const) await tx.registration.create({ data: { studentId: s.id, offeringId: o.externalOfferingId, state, source: 'SUBMIT' } });
    })).rejects.toMatchObject({ code: 'P2002' });
    await isolated(async (tx) => {
      const s = await student(tx); const t = await term(tx);
      const o = await tx.offering.create({ data: { externalOfferingId: randomUUID(), courseId: 'fictional-course', termId: t.id } });
      for (const state of ['REMOVED', 'REMOVED', 'COMMITTED'] as const) await tx.registration.create({ data: { studentId: s.id, offeringId: o.externalOfferingId, state, source: 'SUBMIT' } });
      expect(await tx.registration.count({ where: { offeringId: o.externalOfferingId, state: { in: ['ENROLLED', 'COMMITTED'] } } })).toBe(1);
    });
  });
  it('retains immutable outbox facts while allowing delivery state and newer versions', async () => {
    await isolated(async (tx) => {
      const s = await student(tx); const t = await term(tx);
      const first = await tx.billingOutbox.create({ data: { studentId: s.id, termId: t.id, version: 1, businessId: `${t.id}:${s.id}:1`, payload: { amountYuan: '1200.00' }, amountYuan: '1200.00' } });
      await tx.billingOutbox.update({ where: { id: first.id }, data: { status: 'SUPERSEDED', attempts: 1 } });
      await tx.billingOutbox.create({ data: { studentId: s.id, termId: t.id, version: 2, businessId: `${t.id}:${s.id}:2`, payload: { amountYuan: '1500.00' }, amountYuan: '1500.00' } });
      expect(await tx.billingOutbox.count({ where: { studentId: s.id } })).toBe(2);
    });
    await expect(db.$transaction(async (tx) => {
      const s = await student(tx); const t = await term(tx);
      const bill = await tx.billingOutbox.create({ data: { studentId: s.id, termId: t.id, version: 1, businessId: randomUUID(), payload: { amountYuan: '1200.00' }, amountYuan: '1200.00' } });
      await tx.billingOutbox.update({ where: { id: bill.id }, data: { payload: { amountYuan: '1500.00' } } });
    })).rejects.toThrow('billing payload is immutable');
  });
  it('deduplicates notices with nullable relatedOfferingId', async () => {
    await expect(db.$transaction(async (tx) => {
      const s = await student(tx); const t = await term(tx);
      const o = await tx.offering.create({ data: { externalOfferingId: randomUUID(), courseId: 'fictional-course', termId: t.id } });
      const notice = { studentId: s.id, termId: t.id, offeringId: o.externalOfferingId, kind: 'PREREQUISITE' as const, message: 'Prerequisite missing', revision: '1' };
      await tx.catalogNotice.create({ data: notice }); await tx.catalogNotice.create({ data: { ...notice, revision: '2' } });
    })).rejects.toMatchObject({ code: 'P2002' });
  });
  it('does not let login-only audit records prevent deleting a person account', async () => {
    await isolated(async (tx) => {
      const s = await student(tx);
      const a = await tx.account.create({ data: { account: s.studentNumber, role: 'STUDENT', studentId: s.id, passwordHash: 'test-only' } });
      const audit = await tx.auditEvent.create({ data: { actorAccountId: a.id, requestId: randomUUID(), action: 'LOGIN', objectType: 'Account', objectId: a.id, result: 'SUCCESS', minimalDetails: {} } });
      await tx.account.delete({ where: { id: a.id } });
      await tx.personIdentity.delete({ where: { ssn: s.ssn } }); await tx.student.delete({ where: { id: s.id } });
      expect((await tx.auditEvent.findUniqueOrThrow({ where: { id: audit.id } })).actorAccountId).toBeNull();
    });
  });
});
