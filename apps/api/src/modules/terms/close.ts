import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Runtime, type Actor, type Tx, activeRegistration, json } from '../../runtime/context.js';
import { CatalogService } from '../catalog/service.js';
import { ScheduleService } from '../schedules/service.js';
import { BillingService, billingView } from '../billing/service.js';
import type { Snapshot, BillingPayload } from '../../runtime/external.js';
import { ApiError, requireRules, stale } from '../../errors.js';
import { emptyChoices, type Choices } from '../../rules.js';
import type { CloseResult } from '@wylie/contracts';

export class CloseService {
  constructor(readonly rt: Runtime, readonly catalog: CatalogService, readonly schedules: ScheduleService, readonly billing: BillingService) {}
  async request(actor: Actor, termId: string) {
    await this.rt.actor(this.rt.db, actor, 'REGISTRAR'); await this.rt.term(this.rt.db, termId);
    this.rt.gates.beginClose(termId); const attemptId = randomUUID();
    let students: string[];
    try {
      await this.rt.hook('close.afterGate');
      // Intent is independent of the long write lock: an already admitted transaction
      // may be paused at confirmation. It ignores CLOSING but not natural deadlines.
      students = await this.rt.db.$transaction(async tx => {
        await this.rt.actor(tx, actor, 'REGISTRAR');
        const changed = await tx.term.updateMany({ where: { id: termId, closeState: 'OPEN' }, data: { closeState: 'CLOSING', closeAttemptId: attemptId, lastCloseError: Prisma.DbNull, version: { increment: 1 } } });
        if (!changed.count) throw new ApiError(409, 'CLOSING', '选课正在关闭或已关闭');
        await this.rt.audit(tx, actor, 'close.request', 'Term', termId);
        // Personnel deletion takes the same term row locks. A deletion which
        // already passed admission finishes before this roster is captured.
        return (await tx.student.findMany({ select: { id: true } })).map(s => s.id);
      });
    } catch (error) { const term = await this.rt.term(this.rt.db, termId); this.rt.gates.set(termId, term.closeState); throw error; }
    this.rt.spawn(this.finish(actor, termId, attemptId, students));
    return { termId, closeState: 'CLOSING' as const };
  }
  private async cancel(tx: Tx, offeringId: string, reason: string) {
    await tx.offering.update({ where: { externalOfferingId: offeringId }, data: { status: 'CANCELLED', cancelReason: reason } });
    await tx.registration.updateMany({ where: { offeringId, ...activeRegistration }, data: { state: 'REMOVED', removedReason: reason } });
  }
  async finish(actor: Actor, termId: string, attemptId: string, studentIds: string[]) {
    try {
      await this.rt.gates.drain(termId); await this.rt.hook('close.afterDrain');
      const snapshot = await this.catalog.fresh(termId, undefined, true);
      await this.rt.transaction([termId], async tx => {
        await this.rt.actor(tx, actor, 'REGISTRAR');
        const term = await this.rt.term(tx, termId);
        if (term.closeState !== 'CLOSING' || term.closeAttemptId !== attemptId) throw new Error('CLOSE_INTENT_CHANGED');
        await this.catalog.assertRevision(tx, snapshot);
        const result: CloseResult = { termId, closedAt: (await this.rt.now(tx)).toISOString(), cancelledOfferings: [], leveled: [], unresolved: [], billing: { pending: studentIds.length, acknowledged: 0, superseded: 0 } };
        const offerings = await tx.offering.findMany({ where: { termId } });
        for (const o of offerings) {
          if (o.catalogDeleted) { result.cancelledOfferings.push({ offeringId: o.externalOfferingId, reason: 'CATALOG_DELETED' }); continue; }
          if (!o.professorId) { await this.cancel(tx, o.externalOfferingId, 'NO_PROFESSOR'); result.cancelledOfferings.push({ offeringId: o.externalOfferingId, reason: 'NO_PROFESSOR' }); }
        }
        const schedules = await tx.schedule.findMany({ where: { termId, firstSubmittedAt: { not: null } }, include: { student: true }, orderBy: [{ firstSubmittedAt: 'asc' }, { student: { studentNumber: 'asc' } }] });
        for (const s of schedules) {
          const submitted = (s.submittedChoices as unknown as Choices | null) ?? emptyChoices();
          let primary = (await tx.registration.findMany({ where: { studentId: s.studentId, offering: { termId }, ...activeRegistration } })).map(r => r.offeringId);
          for (const [index, offeringId] of submitted.alternateOfferingIds.entries()) {
            if (primary.length >= 4) break;
            if (primary.includes(offeringId)) continue;
            if ((await this.catalog.issues(tx, snapshot, s.studentId, [...primary, offeringId], [], { capacity: true, professor: true })).some(issue => issue.offeringId === offeringId)) continue;
            await tx.registration.create({ data: { studentId: s.studentId, offeringId, source: 'LEVELING' } }); primary = [...primary, offeringId];
            result.leveled.push({ studentId: s.studentId, offeringId, alternateIndex: index });
          }
        }
        await this.rt.hook('close.afterLeveling');
        for (const o of offerings.filter(o => o.professorId && !o.catalogDeleted)) {
          const count = await tx.registration.count({ where: { offeringId: o.externalOfferingId, ...activeRegistration } });
          if (count < 3) { await this.cancel(tx, o.externalOfferingId, 'UNDER_MINIMUM'); result.cancelledOfferings.push({ offeringId: o.externalOfferingId, reason: 'UNDER_MINIMUM' }); }
          else await tx.offering.update({ where: { externalOfferingId: o.externalOfferingId }, data: { status: 'CLOSED' } });
        }
        await tx.registration.updateMany({ where: { offering: { termId }, state: 'ENROLLED' }, data: { state: 'COMMITTED' } });
        const allSchedules = await tx.schedule.findMany({ where: { termId } });
        for (const s of allSchedules) {
          const ids = (await tx.registration.findMany({ where: { studentId: s.studentId, offering: { termId }, ...activeRegistration } })).map(r => r.offeringId);
          const choices = { primaryOfferingIds: ids, alternateOfferingIds: s.firstSubmittedAt ? (s.submittedChoices as unknown as Choices).alternateOfferingIds.filter(id => !ids.includes(id)) : [] };
          await tx.schedule.update({ where: { id: s.id }, data: { savedChoices: json(choices), submittedChoices: s.firstSubmittedAt ? json(choices) : Prisma.DbNull, exists: !!s.firstSubmittedAt, version: { increment: 1 } } });
          const issues = await this.catalog.issues(tx, snapshot, s.studentId, ids, [], { closed: true });
          if (issues.length) result.unresolved.push({ studentId: s.studentId, issues });
        }
        const closed = await tx.term.update({ where: { id: termId }, data: { closeState: 'CLOSED', closedAt: new Date(result.closedAt), closeAttemptId: null, closeResult: json(result), closedCatalogSnapshot: json(snapshot), pricePerCreditYuan: this.rt.config.pricePerCreditYuan, version: { increment: 1 } } });
        for (const studentId of studentIds) {
          const student = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
          const ids = (await tx.registration.findMany({ where: { studentId, offering: { termId }, ...activeRegistration } })).map(r => r.offeringId);
          const billed = this.offers(snapshot, ids);
          await this.billing.create(tx, student, closed, billed, actor);
        }
        await this.rt.audit(tx, actor, 'close.complete', 'Term', termId);
        await this.rt.hook('close.beforeCommit');
      });
      this.rt.gates.set(termId, 'CLOSED');
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
      try {
        await this.rt.transaction([termId], async tx => {
          await tx.term.updateMany({ where: { id: termId, closeState: 'CLOSING', closeAttemptId: attemptId }, data: { closeState: 'OPEN', closeAttemptId: null, lastCloseError: { code, message: '关闭失败，未更改关闭处理前的课表，可重试' }, version: { increment: 1 } } });
          await this.rt.audit(tx, actor, 'close.complete', 'Term', termId, 'FAILED', code);
        });
        this.rt.gates.set(termId, (await this.rt.term(this.rt.db, termId)).closeState);
      } catch { this.rt.ready = false; this.rt.log({ errorCode: 'CLOSE_RECOVERY_FAILED', termId }); }
    }
  }
  offers(snapshot: Snapshot, ids: string[]): BillingPayload['offerings'] {
    return ids.map(id => { const o = snapshot.offerings.find(o => o.id === id)!; const c = snapshot.courses.find(c => c.id === o.courseId)!; return { offeringId: id, courseId: c.id, courseName: c.name, credits: c.credits }; });
  }
  async supplement(actor: Actor, termId: string, input: { studentId: string; offeringId: string; expectedVersion: number }) {
    const snapshot = await this.rt.external.catalog(termId);
    return this.rt.transaction([termId], async tx => {
      await this.rt.actor(tx, actor, 'REGISTRAR'); const term = await this.rt.term(tx, termId);
      if (term.closeState !== 'CLOSED') throw new ApiError(409, 'PHASE_FORBIDDEN', '仅在关闭后允许补选');
      const student = await tx.student.findUnique({ where: { id: input.studentId } });
      if (!student) throw new ApiError(404, 'NOT_FOUND', '学生不存在');
      if (student.status !== 'ACTIVE') throw new ApiError(403, 'FORBIDDEN', '只有在读学生可补选');
      const s = await tx.schedule.findUnique({ where: { studentId_termId: { studentId: student.id, termId } } });
      if ((s?.version ?? 0) !== input.expectedVersion) stale(s?.version ?? 0);
      const ids = (await tx.registration.findMany({ where: { studentId: student.id, offering: { termId }, ...activeRegistration } })).map(r => r.offeringId);
      if (ids.length >= 4 || ids.includes(input.offeringId)) throw new ApiError(422, 'RULE_VIOLATION', '主选已达 4 门或已注册该班次');
      // Preserve settled meetings/credits for retained courses; validate only the newly
      // added course against the current authority and retained timetable snapshot.
      const frozen = term.closedCatalogSnapshot as unknown as Snapshot;
      const candidate = snapshot.offerings.find(o => o.id === input.offeringId);
      if (!candidate) throw new ApiError(422, 'RULE_VIOLATION', '班次已从目录删除');
      const prior = await tx.billingOutbox.findFirst({ where: { studentId: student.id, termId }, orderBy: { version: 'desc' } });
      const retained = prior ? (prior.payload as unknown as BillingPayload).offerings : this.offers(frozen, ids);
      const merged: Snapshot = { ...snapshot, courses: [...frozen.courses.filter(c => retained.some(o => o.courseId === c.id) && c.id !== candidate.courseId), ...snapshot.courses.filter(c => !retained.some(o => o.courseId === c.id) || c.id === candidate.courseId)], offerings: [...ids.map(id => frozen.offerings.find(o => o.id === id) ?? snapshot.offerings.find(o => o.id === id)!).filter(Boolean), candidate] };
      const issues = (await this.catalog.issues(tx, merged, student.id, [...ids, input.offeringId], [], { capacity: true, professor: true, closed: true })).filter(issue => issue.offeringId === input.offeringId);
      if (issues.some(i => i.code === 'OFFERING_FULL')) throw new ApiError(409, 'OFFERING_FULL', '班次已满', issues);
      requireRules(issues);
      await tx.registration.create({ data: { studentId: student.id, offeringId: input.offeringId, state: 'COMMITTED', source: 'SUPPLEMENT' } });
      const choices = { primaryOfferingIds: [...ids, input.offeringId], alternateOfferingIds: [] };
      await tx.schedule.upsert({ where: { studentId_termId: { studentId: student.id, termId } }, create: { studentId: student.id, termId, version: 1, exists: true, savedChoices: json(choices), submittedChoices: json(choices) }, update: { version: { increment: 1 }, exists: true, savedChoices: json(choices), submittedChoices: json(choices) } });
      const bill = await this.billing.create(tx, student, term, [...retained, ...this.offers(snapshot, [input.offeringId])], actor);
      await this.rt.audit(tx, actor, 'schedule.supplement', 'Student', student.id);
      return { schedule: await this.schedules.view(student.id, termId, tx), billing: billingView(bill) };
    });
  }
}
