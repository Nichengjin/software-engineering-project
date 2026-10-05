import { Runtime, type Actor, activeRegistration } from '../../runtime/context.js';
import { CatalogService } from '../catalog/service.js';
import { ApiError, requireRules, stale } from '../../errors.js';
import { overlaps, grades } from '../../rules.js';
import type { Grade } from '@prisma/client';

export class TeachingService {
  constructor(readonly rt: Runtime, readonly catalog: CatalogService) {}
  async view(professorId: string, termId: string) {
    await this.rt.term(this.rt.db, termId);
    const version = await this.rt.db.teachingVersion.findUnique({ where: { professorId_termId: { professorId, termId } } });
    const offerings = await this.rt.db.offering.findMany({ where: { professorId, termId }, orderBy: { externalOfferingId: 'asc' } });
    return { termId, version: version?.version ?? 0, offeringIds: offerings.map(o => o.externalOfferingId) };
  }
  async write(actor: Actor, termId: string, expectedVersion: number, offeringIds: string[]) {
    const admission = this.rt.gates.admit(termId);
    try {
      const snapshot = await this.catalog.fresh(termId, admission);
      await this.rt.transaction([termId], async tx => {
        const account = await this.rt.actor(tx, actor, 'PROFESSOR'); const professorId = account.professorId!; const term = await this.rt.term(tx, termId);
        if (term.closeState === 'CLOSED') throw new ApiError(409, 'ALREADY_CLOSED', '选课已关闭');
        if (await this.rt.now(tx) < term.teachingStartsAt) throw new ApiError(409, 'PHASE_FORBIDDEN', '授课选择尚未开始');
        const version = await tx.teachingVersion.findUnique({ where: { professorId_termId: { professorId, termId } } });
        if ((version?.version ?? 0) !== expectedVersion) stale(version?.version ?? 0);
        await this.catalog.assertRevision(tx, snapshot);
        const qualifications = new Set((await tx.qualification.findMany({ where: { professorId } })).map(q => q.courseId));
        const selected = snapshot.offerings.filter(o => offeringIds.includes(o.id));
        requireRules(offeringIds.filter(id => !selected.some(o => o.id === id)).map(offeringId => ({ offeringId, code: 'OFFERING_CLOSED', message: '班次不存在' })));
        for (const o of selected) {
          if (!qualifications.has(o.courseId)) throw new ApiError(403, 'FORBIDDEN', '没有此课程授课资格');
          const row = await tx.offering.findUniqueOrThrow({ where: { externalOfferingId: o.id } });
          if (row.status !== 'OPEN' || row.catalogDeleted) throw new ApiError(422, 'RULE_VIOLATION', '班次已取消');
          if (row.professorId && row.professorId !== professorId) throw new ApiError(409, 'OFFERING_TAKEN', '这个班次已被其他教授选择');
        }
        const issues = [];
        for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) if (overlaps(selected[i]!.meetings, selected[j]!.meetings)) issues.push({ offeringId: selected[j]!.id, code: 'TIME_CONFLICT', message: `与 ${selected[i]!.id} 时间冲突` });
        requireRules(issues);
        const current = await tx.offering.findMany({ where: { termId, professorId } });
        for (const o of current.filter(o => !offeringIds.includes(o.externalOfferingId))) {
          await tx.offering.update({ where: { externalOfferingId: o.externalOfferingId }, data: { professorId: null } });
          await tx.teachingHistory.updateMany({ where: { professorId, offeringId: o.externalOfferingId, endedAt: null }, data: { endedAt: await this.rt.now(tx) } });
        }
        for (const o of selected.filter(o => !current.some(c => c.externalOfferingId === o.id))) {
          await tx.offering.update({ where: { externalOfferingId: o.id }, data: { professorId } });
          await tx.teachingHistory.create({ data: { professorId, offeringId: o.id } });
        }
        await tx.teachingVersion.upsert({ where: { professorId_termId: { professorId, termId } }, create: { professorId, termId, version: 1 }, update: { version: { increment: 1 } } });
        await this.rt.audit(tx, actor, 'teaching.replace', 'Professor', professorId);
      });
      const account = await this.rt.actor(this.rt.db, actor, 'PROFESSOR');
      return { teaching: await this.view(account.professorId!, termId) };
    } finally { admission.release(); }
  }
  async own(actor: Actor, offeringId: string, tx = this.rt.db as import('../../runtime/context.js').Tx) {
    const account = await this.rt.actor(tx, actor, 'PROFESSOR');
    const o = await tx.offering.findUnique({ where: { externalOfferingId: offeringId } });
    if (!o || o.professorId !== account.professorId) throw new ApiError(403, 'FORBIDDEN', '只能访问本人负责班次');
    return o;
  }
  async roster(actor: Actor, offeringId: string) {
    const o = await this.own(actor, offeringId);
    const snapshot = (await this.rt.db.catalogSnapshot.findUniqueOrThrow({ where: { termId: o.termId } })).payload as unknown as import('../../runtime/external.js').Snapshot;
    let offering = (await this.catalog.view(o.termId, undefined, snapshot)).offerings.find(v => v.id === offeringId);
    if (!offering) {
      const course = await this.rt.db.courseMirror.findUniqueOrThrow({ where: { externalCourseId: o.courseId } });
      const professor = await this.rt.db.professor.findUniqueOrThrow({ where: { id: o.professorId! } });
      offering = { id: offeringId, termId: o.termId, courseId: o.courseId, courseName: course.name, department: course.department, credits: course.credits.toFixed(2), prerequisiteCourseIds: course.prerequisiteIds as string[], meetings: [], professor: { id: professor.id, name: professor.name }, enrolledCount: 0, capacity: 10, status: o.status };
    }
    const rows = await this.rt.db.registration.findMany({ where: { offeringId, ...activeRegistration }, include: { student: true } });
    const stored = await this.rt.db.gradeRecord.findMany({ where: { offeringId } });
    return { offering, students: rows.map(r => ({ studentId: r.studentId, studentNumber: r.student.studentNumber, name: r.student.name, grade: stored.find(g => g.studentId === r.studentId)?.value ?? null })) };
  }
  async saveGrades(actor: Actor, offeringId: string, cells: { studentId: string; grade: string | null }[]) {
    const original = await this.own(actor, offeringId);
    return this.rt.transaction([original.termId], async tx => {
      const o = await this.own(actor, offeringId, tx); const { previous, launch } = await this.rt.termContext(tx);
      if (!previous || previous.id !== o.termId || previous.ordinal < launch.ordinal) throw new ApiError(403, 'FORBIDDEN', '仅能录入上一已完成且不早于上线学期的成绩');
      const rows = await tx.registration.findMany({ where: { offeringId, ...activeRegistration } });
      if (cells.some(c => !rows.some(r => r.studentId === c.studentId))) throw new ApiError(403, 'FORBIDDEN', '成绩包含非本班学生，整份未修改');
      const mirror = await tx.courseMirror.findUnique({ where: { externalCourseId: o.courseId } });
      const results = [];
      for (const cell of cells) {
        const key = { studentId: cell.studentId, courseId: o.courseId, termId: o.termId };
        const prior = await tx.gradeRecord.findUnique({ where: { studentId_courseId_termId: key } });
        if (cell.grade === '' || cell.grade === null) { results.push({ studentId: cell.studentId, outcome: 'UNCHANGED', grade: prior?.value ?? null, issue: null }); continue; }
        if (!grades.has(cell.grade)) {
          results.push({ studentId: cell.studentId, outcome: 'REJECTED', grade: prior?.value ?? null, issue: { studentId: cell.studentId, code: 'INVALID_GRADE', message: '成绩只能为 A、B、C、D、F、I' } });
          await this.rt.audit(tx, actor, 'grade.save', 'Student', cell.studentId, 'FAILED', 'INVALID_GRADE'); continue;
        }
        await tx.gradeRecord.upsert({ where: { studentId_courseId_termId: key }, create: { ...key, offeringId, value: cell.grade as Grade, source: 'PROFESSOR', courseNameSnapshot: mirror?.name ?? o.courseId, updatedByAccountId: actor.accountId }, update: { value: cell.grade as Grade, updatedByAccountId: actor.accountId } });
        await this.rt.audit(tx, actor, 'grade.save', 'Student', cell.studentId, 'SUCCESS', undefined, { offeringId, old: prior?.value ?? null, value: cell.grade });
        results.push({ studentId: cell.studentId, outcome: 'SAVED', grade: cell.grade, issue: null });
      }
      return { results };
    });
  }
}
