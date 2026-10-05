import { Prisma } from '@prisma/client';
import { Runtime, type Actor, type Tx, activeRegistration, json } from '../../runtime/context.js';
import { CatalogService } from '../catalog/service.js';
import { ApiError, requireRules, stale } from '../../errors.js';
import { choiceIssues, emptyChoices, studentWindow, type Choices } from '../../rules.js';

export class ScheduleService {
  constructor(readonly rt: Runtime, readonly catalog: CatalogService) {}
  async view(studentId: string, termId: string, tx: Tx = this.rt.db) {
    await this.rt.term(tx, termId);
    const s = await tx.schedule.findUnique({ where: { studentId_termId: { studentId, termId } } });
    const regs = await tx.registration.findMany({ where: { studentId, offering: { termId }, ...activeRegistration }, orderBy: { offeringId: 'asc' } });
    return { studentId, termId, version: s?.version ?? 0, exists: s?.exists ?? false, firstSubmittedAt: s?.firstSubmittedAt?.toISOString() ?? null, saved: s?.savedChoices ?? emptyChoices(), submitted: s?.submittedChoices ?? null, registrations: regs.map(r => ({ offeringId: r.offeringId, source: r.source, state: r.state })) };
  }
  async clear(tx: Tx, studentId: string, termId: string, reason: string) {
    await tx.registration.updateMany({ where: { studentId, offering: { termId }, ...activeRegistration }, data: { state: 'REMOVED', removedReason: reason } });
    await tx.schedule.updateMany({ where: { studentId, termId }, data: { exists: false, savedChoices: json(emptyChoices()), submittedChoices: Prisma.DbNull, firstSubmittedAt: null, version: { increment: 1 } } });
  }
  async write(actor: Actor, termId: string, expectedVersion: number, choices: Choices, mode: 'SAVE' | 'SUBMIT' | 'DELETE') {
    choices = { primaryOfferingIds: choices.primaryOfferingIds, alternateOfferingIds: choices.alternateOfferingIds };
    const token = this.rt.gates.admit(termId);
    try {
      const snapshot = mode === 'DELETE' ? null : await this.catalog.fresh(termId, token);
      return await this.rt.transaction([termId], async tx => {
        const account = await this.rt.actor(tx, actor, 'STUDENT'); const studentId = account.studentId!;
        const term = await this.rt.term(tx, termId);
        if (term.closeState === 'CLOSED') throw new ApiError(409, 'ALREADY_CLOSED', '选课已关闭');
        if (!studentWindow(term, await this.rt.now(tx))) throw new ApiError(409, 'PHASE_FORBIDDEN', '当前不在初选或加退选期');
        const existing = await tx.schedule.findUnique({ where: { studentId_termId: { studentId, termId } } });
        if ((existing?.version ?? 0) !== expectedVersion) stale(existing?.version ?? 0);
        if (mode === 'DELETE' && !existing?.exists) throw new ApiError(404, 'NOT_FOUND', '没有课表');
        if (snapshot) {
          await this.catalog.assertRevision(tx, snapshot);
          requireRules(choiceIssues(choices, mode === 'SUBMIT' ? !existing?.firstSubmittedAt : undefined));
          if (mode === 'SAVE') {
            const ids = new Set(snapshot.offerings.map(o => o.id));
            requireRules([...choices.primaryOfferingIds, ...choices.alternateOfferingIds].filter(id => !ids.has(id)).map(offeringId => ({ offeringId, code: 'OFFERING_CLOSED', message: '班次不存在' })));
          } else {
            const issues = await this.catalog.issues(tx, snapshot, studentId, choices.primaryOfferingIds, choices.alternateOfferingIds, { capacity: true });
            if (issues.some(i => i.code === 'OFFERING_FULL')) throw new ApiError(409, 'OFFERING_FULL', '班次已满', issues);
            requireRules(issues);
          }
        }
        const s = existing ?? await tx.schedule.create({ data: { studentId, termId } });
        if (mode === 'SUBMIT') {
          const regs = await tx.registration.findMany({ where: { studentId, offering: { termId }, ...activeRegistration } });
          await tx.registration.updateMany({ where: { id: { in: regs.filter(r => !choices.primaryOfferingIds.includes(r.offeringId)).map(r => r.id) } }, data: { state: 'REMOVED', removedReason: 'DROP' } });
          for (const offeringId of choices.primaryOfferingIds.filter(id => !regs.some(r => r.offeringId === id))) await tx.registration.create({ data: { studentId, offeringId, source: 'SUBMIT' } });
          await tx.catalogNotice.updateMany({ where: { studentId, termId, kind: { not: 'OFFERING_DELETED' } }, data: { resolved: true } });
        }
        if (mode === 'DELETE') await tx.registration.updateMany({ where: { studentId, offering: { termId }, ...activeRegistration }, data: { state: 'REMOVED', removedReason: 'DELETE_SCHEDULE' } });
        await this.rt.audit(tx, actor, `schedule.${mode.toLowerCase()}`, 'Schedule', s.id);
        if (mode === 'SUBMIT') await this.rt.hook('submit.beforeConfirm');
        const now = this.rt.deps.clock ? Prisma.sql`${this.rt.deps.clock()}::timestamptz` : Prisma.sql`clock_timestamp()`;
        const saved = mode === 'DELETE' ? emptyChoices() : choices;
        const submitted = mode === 'SAVE' ? s.submittedChoices : mode === 'DELETE' ? null : choices;
        const updated = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          WITH confirmation AS MATERIALIZED (SELECT ${now} AS at)
          UPDATE "Schedule" s SET "exists" = ${mode !== 'DELETE'}, "savedChoices" = ${JSON.stringify(saved)}::jsonb,
            "submittedChoices" = ${submitted === null ? null : JSON.stringify(submitted)}::jsonb,
            "firstSubmittedAt" = CASE WHEN ${mode === 'DELETE'} THEN NULL WHEN ${mode === 'SUBMIT'} THEN COALESCE(s."firstSubmittedAt", confirmation.at) ELSE s."firstSubmittedAt" END,
            "version" = s."version" + 1, "updatedAt" = confirmation.at
          FROM "Term" t, confirmation WHERE s.id = ${s.id}::uuid AND t.id = s."termId"
            AND ((confirmation.at >= t."initialStartsAt" AND confirmation.at < t."initialEndsAt") OR (confirmation.at >= t."addDropStartsAt" AND confirmation.at < t."addDropEndsAt")) RETURNING s.id`);
        if (!updated.length) throw new ApiError(409, 'PHASE_FORBIDDEN', '确认时已过选课截止，原注册不变');
        return { schedule: await this.view(studentId, termId, tx) };
      });
    } finally { token.release(); }
  }
}
