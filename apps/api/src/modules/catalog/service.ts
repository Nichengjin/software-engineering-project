import type { Snapshot } from '../../runtime/external.js';
import { Runtime, type Tx, activeRegistration, json } from '../../runtime/context.js';
import type { Admission } from '../../runtime/gate.js';
import { ApiError } from '../../errors.js';
import { emptyChoices, overlaps, passing, type Choices, type Issue } from '../../rules.js';
import type { Catalog } from '@wylie/contracts';

export class CatalogService {
  private queues = new Map<string, { job: Promise<Snapshot>; pending: boolean; applyDuringClose: boolean }>();
  private views = new Map<string, { job: Promise<Catalog>; pending: boolean }>();
  constructor(readonly rt: Runtime) {}
  async fresh(termId: string, admission?: Admission, closing = false): Promise<Snapshot> {
    const previous = this.queues.get(termId);
    if (previous?.pending) {
      previous.applyDuringClose ||= Boolean(admission || closing);
      return previous.job;
    }
    const before = previous?.job ?? Promise.resolve();
    const job = before.catch(() => {}).then(async () => {
      // Join only a fetch that has not started yet. Arrivals during HTTP/apply
      // share the next generation, never a snapshot fetched before they arrived.
      batch.pending = false;
      const snapshot = await this.rt.external.catalog(termId);
      if (!batch.applyDuringClose && this.rt.gates.status(termId) !== 'OPEN') return snapshot;
      let owned: Admission | undefined;
      if (!batch.applyDuringClose) owned = this.rt.gates.admit(termId);
      try { await this.apply(snapshot); } finally { owned?.release(); }
      return snapshot;
    });
    const batch = { job, pending: true, applyDuringClose: Boolean(admission || closing) };
    this.queues.set(termId, batch);
    try { return await job; } finally { if (this.queues.get(termId) === batch) this.queues.delete(termId); }
  }
  async assertRevision(tx: Tx, snapshot: Snapshot) {
    const stored = await tx.catalogSnapshot.findUnique({ where: { termId: snapshot.termId }, select: { revision: true } });
    if (stored?.revision !== snapshot.revision) throw new ApiError(409, 'CATALOG_CHANGED', '课程目录已更新，请重新加载');
  }
  async prerequisites(tx: Tx, studentId: string, courseIds: string[]): Promise<Set<string>> {
    const now = await this.rt.now(tx);
    const rows = await tx.gradeRecord.findMany({ where: { studentId, courseId: { in: courseIds }, value: { in: ['A','B','C','D'] }, term: { endsAt: { lte: now } } } });
    return new Set(rows.filter(r => r.value && passing.has(r.value)).map(r => r.courseId));
  }
  async issues(tx: Tx, snapshot: Snapshot, studentId: string, primary: string[], alternate: string[] = [], options: { capacity?: boolean; professor?: boolean; closed?: boolean } = {}): Promise<Issue[]> {
    const local = await tx.offering.findMany({ where: { termId: snapshot.termId, externalOfferingId: { in: [...primary, ...alternate] } }, include: { registrations: { where: activeRegistration } } });
    const byId = new Map(local.map(o => [o.externalOfferingId, o]));
    const remote = new Map(snapshot.offerings.map(o => [o.id, o])); const courses = new Map(snapshot.courses.map(c => [c.id, c]));
    const passed = await this.prerequisites(tx, studentId, snapshot.courses.flatMap(c => c.prerequisiteCourseIds));
    const issues: Issue[] = [];
    for (const id of [...primary, ...alternate]) {
      const offering = remote.get(id); const row = byId.get(id); const course = offering && courses.get(offering.courseId);
      if (!row || !offering || !course || row.catalogDeleted || row.status === 'CANCELLED' || (!options.closed && row.status !== 'OPEN')) { issues.push({ offeringId: id, code: 'OFFERING_CLOSED', message: '班次不存在或已取消／关闭' }); continue; }
      if (course.prerequisiteCourseIds.some(p => !passed.has(p))) issues.push({ offeringId: id, code: 'PREREQUISITE', message: '全部先修课程须及格' });
      if (primary.includes(id)) {
        if (options.professor && !row.professorId) issues.push({ offeringId: id, code: 'NO_PROFESSOR', message: '班次没有授课教授' });
        if (options.capacity && row.registrations.filter(r => r.studentId !== studentId).length >= 10) issues.push({ offeringId: id, code: 'OFFERING_FULL', message: '班次已满' });
      }
    }
    for (let i = 0; i < primary.length; i++) for (let j = i + 1; j < primary.length; j++) {
      const a = remote.get(primary[i]!); const b = remote.get(primary[j]!); if (!a || !b) continue;
      if (a.courseId === b.courseId) issues.push({ offeringId: b.id, code: 'DUPLICATE_COURSE', message: '主选不能包含同一课程的两个班次' });
      if (overlaps(a.meetings, b.meetings)) issues.push({ offeringId: b.id, code: 'TIME_CONFLICT', message: `班次与 ${a.id} 时间冲突` });
    }
    return issues;
  }
  async apply(snapshot: Snapshot) {
    await this.rt.transaction([snapshot.termId], async tx => {
      const term = await this.rt.term(tx, snapshot.termId); if (term.closeState === 'CLOSED') return;
      const previous = await tx.catalogSnapshot.findUnique({ where: { termId: snapshot.termId }, select: { revision: true } });
      if (previous?.revision === snapshot.revision) return;
      for (const c of snapshot.courses) await tx.courseMirror.upsert({ where: { externalCourseId: c.id }, create: { externalCourseId: c.id, name: c.name, department: c.department, credits: c.credits, prerequisiteIds: c.prerequisiteCourseIds, revision: snapshot.revision }, update: { name: c.name, department: c.department, credits: c.credits, prerequisiteIds: c.prerequisiteCourseIds, revision: snapshot.revision } });
      for (const o of snapshot.offerings) {
        const existing = await tx.offering.findUnique({ where: { externalOfferingId: o.id } });
        if (existing && (existing.termId !== o.termId || existing.courseId !== o.courseId)) throw new ApiError(503, 'CATALOG_UNAVAILABLE', '目录班次标识不能更换归属');
        await tx.offering.upsert({ where: { externalOfferingId: o.id }, create: { externalOfferingId: o.id, termId: o.termId, courseId: o.courseId }, update: {} });
      }
      const deleted = await tx.offering.findMany({ where: { termId: snapshot.termId, catalogDeleted: false, externalOfferingId: { notIn: snapshot.offerings.map(o => o.id) } } });
      const removed = new Set(deleted.map(o => o.externalOfferingId));
      for (const o of deleted) {
        const registrations = await tx.registration.findMany({ where: { offeringId: o.externalOfferingId, ...activeRegistration } });
        await tx.offering.update({ where: { externalOfferingId: o.externalOfferingId }, data: { catalogDeleted: true, status: 'CANCELLED', cancelReason: 'CATALOG_DELETED' } });
        await tx.registration.updateMany({ where: { offeringId: o.externalOfferingId, ...activeRegistration }, data: { state: 'REMOVED', removedReason: 'CATALOG_DELETED' } });
        for (const r of registrations) await this.notice(tx, snapshot, r.studentId, o.externalOfferingId, null, 'OFFERING_DELETED', '目录已删除班次，注册已取消');
      }
      const schedules = await tx.schedule.findMany({ where: { termId: snapshot.termId } });
      for (const s of schedules) {
        const saved = s.savedChoices as unknown as Choices; const submitted = s.submittedChoices as unknown as Choices | null;
        const filter = (c: Choices) => ({ primaryOfferingIds: c.primaryOfferingIds.filter(id => !removed.has(id)), alternateOfferingIds: c.alternateOfferingIds.filter(id => !removed.has(id)) });
        if ([...saved.primaryOfferingIds, ...saved.alternateOfferingIds, ...(submitted?.primaryOfferingIds ?? []), ...(submitted?.alternateOfferingIds ?? [])].some(id => removed.has(id))) await tx.schedule.update({ where: { id: s.id }, data: { savedChoices: json(filter(saved)), ...(submitted ? { submittedChoices: json(filter(submitted)) } : {}), version: { increment: 1 } } });
        const regs = await tx.registration.findMany({ where: { studentId: s.studentId, offering: { termId: snapshot.termId }, ...activeRegistration } });
        await tx.catalogNotice.updateMany({ where: { studentId: s.studentId, termId: snapshot.termId, kind: { in: ['PREREQUISITE','TIME_CONFLICT'] } }, data: { resolved: true } });
        const ids = regs.map(r => r.offeringId); const issues = await this.issues(tx, snapshot, s.studentId, ids);
        for (const issue of issues) {
          if (issue.code === 'PREREQUISITE') await this.notice(tx, snapshot, s.studentId, issue.offeringId!, null, 'PREREQUISITE', issue.message);
        }
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
          const a = snapshot.offerings.find(o => o.id === ids[i]); const b = snapshot.offerings.find(o => o.id === ids[j]);
          if (a && b && overlaps(a.meetings, b.meetings)) await this.notice(tx, snapshot, s.studentId, a.id, b.id, 'TIME_CONFLICT', '课程目录变更导致时间冲突，课程保留，请调整');
        }
      }
      await tx.catalogSnapshot.upsert({ where: { termId: snapshot.termId }, create: { termId: snapshot.termId, revision: snapshot.revision, payload: json(snapshot), observedAt: await this.rt.now(tx) }, update: { revision: snapshot.revision, payload: json(snapshot), observedAt: await this.rt.now(tx) } });
    });
  }
  private async notice(tx: Tx, snapshot: Snapshot, studentId: string, offeringId: string, relatedOfferingId: string | null, kind: 'PREREQUISITE' | 'TIME_CONFLICT' | 'OFFERING_DELETED', message: string) {
    const where = { studentId, termId: snapshot.termId, offeringId, relatedOfferingId, kind };
    const existing = await tx.catalogNotice.findFirst({ where });
    if (existing) await tx.catalogNotice.update({ where: { id: existing.id }, data: { resolved: false, revision: snapshot.revision, message } });
    else await tx.catalogNotice.create({ data: { ...where, revision: snapshot.revision, message } });
  }
  async view(termId: string, professorId?: string, provided?: Snapshot) {
    if (provided) return this.project(termId, professorId, provided);
    const key = JSON.stringify([termId, professorId ?? null]);
    const previous = this.views.get(key);
    if (previous?.pending) return previous.job;
    const job = (previous?.job ?? Promise.resolve()).catch(() => {}).then(async () => {
      batch.pending = false;
      return this.project(termId, professorId);
    });
    const batch = { job, pending: true }; this.views.set(key, batch);
    try { return await job; } finally { if (this.views.get(key) === batch) this.views.delete(key); }
  }
  private async project(termId: string, professorId?: string, provided?: Snapshot): Promise<Catalog> {
    const snapshot = provided ?? await this.rt.external.catalog(termId);
    const term = await this.rt.term(this.rt.db, termId);
    if (term.closeState !== 'CLOSED') await this.assertRevision(this.rt.db, snapshot);
    const rows = await this.rt.db.offering.findMany({ where: { termId }, include: { professor: true, _count: { select: { registrations: { where: activeRegistration } } } } });
    const byId = new Map(rows.map(row => [row.externalOfferingId, row]));
    const courses = new Map(snapshot.courses.map(course => [course.id, course]));
    const qualified = professorId ? new Set((await this.rt.db.qualification.findMany({ where: { professorId } })).map(q => q.courseId)) : null;
    const observed = await this.rt.db.catalogSnapshot.findUnique({ where: { termId }, select: { observedAt: true } });
    return { termId, revision: snapshot.revision, observedAt: (observed?.observedAt ?? await this.rt.now()).toISOString(), offerings: snapshot.offerings.map(o => {
      const c = courses.get(o.courseId)!; const local = byId.get(o.id);
      return { id: o.id, termId, courseId: c.id, courseName: c.name, department: c.department, credits: c.credits, prerequisiteCourseIds: c.prerequisiteCourseIds, meetings: o.meetings, professor: local?.professor ? { id: local.professor.id, name: local.professor.name } : null, enrolledCount: local?._count.registrations ?? 0, capacity: 10 as const, status: local?.status ?? (term.closeState === 'CLOSED' ? 'CANCELLED' : 'OPEN'), ...(qualified ? { eligibleToTeach: qualified.has(c.id) } : {}) };
    }) };
  }
}
