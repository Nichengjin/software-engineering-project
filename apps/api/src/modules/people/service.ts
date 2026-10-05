import { createHmac } from 'node:crypto';
import type { Student, Professor, Account } from '@prisma/client';
import type { StudentInput, ProfessorInput, StudentUpdate, ProfessorUpdate } from '@wylie/contracts';
import { Runtime, type Actor, type Tx } from '../../runtime/context.js';
import { ScheduleService } from '../schedules/service.js';
import { hashPassword, randomToken, safeEqual, digest } from '../../auth/password.js';
import { ApiError, stale } from '../../errors.js';
import type { Admission } from '../../runtime/gate.js';

export type Kind = 'students' | 'professors';
type Person = (Student | Professor) & { account?: Account | null };
const canonical = (patch: object) => JSON.stringify(Object.fromEntries(Object.entries(patch).sort(([a], [b]) => a.localeCompare(b))));
export function personView(p: Person) {
  const common = { id: p.id, account: 'studentNumber' in p ? p.studentNumber : p.professorNumber, version: p.version, name: p.name, birthDate: p.birthDate.toISOString().slice(0, 10), ssnMasked: `***${p.ssn.slice(-4)}`, accountEnabled: p.account?.enabled ?? false };
  return 'studentNumber' in p ? { ...common, kind: 'STUDENT' as const, status: p.status, graduationDate: p.graduationDate?.toISOString().slice(0, 10) ?? null } : { ...common, kind: 'PROFESSOR' as const, status: p.status, department: p.department };
}
export class PeopleService {
  constructor(readonly rt: Runtime, readonly schedules: ScheduleService) {}
  async find(kind: Kind, id: string, tx: Tx = this.rt.db): Promise<Person> {
    const person = kind === 'students' ? await tx.student.findUnique({ where: { id }, include: { account: true } }) : await tx.professor.findUnique({ where: { id }, include: { account: true } });
    if (!person) throw new ApiError(404, 'NOT_FOUND', '人员不存在'); return person;
  }
  async create(actor: Actor, kind: Kind, input: StudentInput | ProfessorInput) {
    const password = randomToken(); const passwordHash = await hashPassword(password);
    return this.rt.transaction([], async tx => {
      await this.rt.actor(tx, actor, 'REGISTRAR');
      if (await tx.personIdentity.findUnique({ where: { ssn: input.ssn } })) throw new ApiError(409, 'HAS_RECORDS', '此人员已存在');
      const common = { name: input.name, birthDate: new Date(`${input.birthDate}T00:00:00Z`), ssn: input.ssn };
      let person: Person;
      if (kind === 'students') {
        const s = input as StudentInput;
        person = await tx.student.create({ data: { ...common, status: s.status, graduationDate: s.graduationDate ? new Date(`${s.graduationDate}T00:00:00Z`) : null } });
        await tx.personIdentity.create({ data: { ssn: input.ssn, studentId: person.id } });
        await tx.account.create({ data: { account: person.studentNumber, studentId: person.id, role: 'STUDENT', passwordHash, enabled: input.accountEnabled } });
      } else {
        const p = input as ProfessorInput;
        person = await tx.professor.create({ data: { ...common, status: p.status, department: p.department } });
        await tx.personIdentity.create({ data: { ssn: input.ssn, professorId: person.id } });
        await tx.account.create({ data: { account: person.professorNumber, professorId: person.id, role: 'PROFESSOR', passwordHash, enabled: input.accountEnabled } });
      }
      await this.rt.audit(tx, actor, 'person.create', kind, person.id);
      const view = personView(await this.find(kind, person.id, tx));
      return { person: view, initialCredential: { account: view.account, initialPassword: password } };
    });
  }
  async impact(tx: Tx, kind: Kind, id: string) {
    const person = await this.find(kind, id, tx); const terms = await tx.term.findMany({ orderBy: { id: 'asc' } });
    const output = [];
    for (const term of terms) {
      const schedule = kind === 'students' ? await tx.schedule.findUnique({ where: { studentId_termId: { studentId: id, termId: term.id } } }) : null;
      const offerings = kind === 'students' ? await tx.registration.findMany({ where: { studentId: id, offering: { termId: term.id }, state: { in: ['ENROLLED','COMMITTED'] } } }) : await tx.offering.findMany({ where: { professorId: id, termId: term.id } });
      if (!schedule && !offerings.length) continue;
      output.push({ termId: term.id, offeringIds: offerings.map(o => 'offeringId' in o ? o.offeringId : o.externalOfferingId).sort(), clearSchedule: kind === 'students' && term.closeState !== 'CLOSED' && !!schedule?.exists, retainedClosedRecords: term.closeState === 'CLOSED', termVersion: term.version, scheduleVersion: schedule?.version ?? null, gate: this.rt.gates.status(term.id) });
    }
    return { person, terms: output, fingerprint: digest(JSON.stringify(output)) };
  }
  private sign(payload: string) { return createHmac('sha256', this.rt.config.impactSigningKey).update(payload).digest('hex'); }
  async preview(actor: Actor, kind: Kind, id: string, input: StudentUpdate | ProfessorUpdate) {
    await this.rt.actor(this.rt.db, actor, 'REGISTRAR');
    // Locks give preview one consistent snapshot; it writes no business rows.
    return this.rt.transaction([], async tx => {
      const state = await this.impact(tx, kind, id); if (state.person.version !== input.expectedVersion) stale(state.person.version);
      const expiresAt = new Date((await this.rt.now(tx)).getTime() + 300000).toISOString();
      const payload = Buffer.from(JSON.stringify({ kind, id, version: state.person.version, patch: canonical(input.patch), fingerprint: state.fingerprint, expiresAt })).toString('base64url');
      return { impact: { personVersion: state.person.version, impactToken: `${payload}.${this.sign(payload)}`, expiresAt, terms: state.terms.map(({ termId, offeringIds, clearSchedule, retainedClosedRecords }) => ({ termId, offeringIds, clearSchedule, retainedClosedRecords })) } };
    });
  }
  async update(actor: Actor, kind: Kind, id: string, input: StudentUpdate | ProfessorUpdate) {
    const before = await this.impact(this.rt.db, kind, id);
    const clears = input.patch.status !== undefined && before.person.status === 'ACTIVE' && input.patch.status !== 'ACTIVE';
    const admissions: Admission[] = [];
    try {
      if (clears) for (const term of before.terms.filter(t => !t.retainedClosedRecords)) {
        if (this.rt.gates.status(term.termId) !== 'OPEN') throw new ApiError(409, 'IMPACT_CHANGED', '学期开始关闭，请重新预览');
        admissions.push(this.rt.gates.admit(term.termId));
      }
      return await this.rt.transaction(before.terms.map(t => t.termId), async tx => {
        await this.rt.actor(tx, actor, 'REGISTRAR'); const state = await this.impact(tx, kind, id); const person = state.person;
        if (person.version !== input.expectedVersion) stale(person.version);
        if (clears) {
          const invalid = () => new ApiError(409, 'IMPACT_CHANGED', '影响已变化或确认过期，请重新预览');
          if (!input.confirmed || !input.impactToken) throw invalid();
          const [payload, signature] = input.impactToken.split('.');
          if (!payload || !signature || !safeEqual(signature, this.sign(payload))) throw invalid();
          let proof: { kind: string; id: string; version: number; patch: string; fingerprint: string; expiresAt: string };
          try { proof = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw invalid(); }
          if (proof.kind !== kind || proof.id !== id || proof.version !== person.version || proof.patch !== canonical(input.patch) || proof.fingerprint !== state.fingerprint || new Date(proof.expiresAt) <= await this.rt.now(tx) || state.terms.some(t => t.gate === 'CLOSING')) throw invalid();
          if (state.terms.some(t => !t.retainedClosedRecords && !admissions.some(a => a.termId === t.termId))) throw invalid();
          for (const term of state.terms.filter(t => !t.retainedClosedRecords)) {
            if (kind === 'students') await this.schedules.clear(tx, id, term.termId, 'STUDENT_STATUS');
            else {
              await tx.offering.updateMany({ where: { termId: term.termId, professorId: id }, data: { professorId: null } });
              await tx.teachingHistory.updateMany({ where: { professorId: id, offering: { termId: term.termId }, endedAt: null }, data: { endedAt: await this.rt.now(tx) } });
              await tx.teachingVersion.updateMany({ where: { professorId: id, termId: term.termId }, data: { version: { increment: 1 } } });
            }
          }
        }
        const { accountEnabled, birthDate, ssn, ...patch } = input.patch;
        if (ssn && ssn !== person.ssn) {
          if (await tx.personIdentity.findUnique({ where: { ssn } })) throw new ApiError(409, 'HAS_RECORDS', '此社会安全号码已存在');
          await tx.personIdentity.update({ where: { ssn: person.ssn }, data: { ssn } });
        }
        const common = { ...(birthDate ? { birthDate: new Date(`${birthDate}T00:00:00Z`) } : {}), ...(ssn ? { ssn } : {}), version: { increment: 1 } };
        if (kind === 'students') {
          const s = patch as Partial<StudentInput>; const { graduationDate, accountEnabled: unused, ssn: unusedSsn, birthDate: unusedDate, ...rest } = s;
          await tx.student.update({ where: { id }, data: { ...common, ...rest, ...(graduationDate !== undefined ? { graduationDate: graduationDate ? new Date(`${graduationDate}T00:00:00Z`) : null } : {}) } });
        } else await tx.professor.update({ where: { id }, data: { ...common, ...patch as Partial<Pick<ProfessorInput, 'name' | 'status' | 'department'>> } });
        if (accountEnabled !== undefined) await tx.account.update({ where: { id: person.account!.id }, data: { enabled: accountEnabled } });
        if (accountEnabled === false || (kind === 'professors' && input.patch.status === 'DEPARTED')) await tx.session.deleteMany({ where: { accountId: person.account!.id } });
        await this.rt.audit(tx, actor, 'person.update', kind, id);
        return { person: personView(await this.find(kind, id, tx)) };
      });
    } finally { admissions.forEach(a => a.release()); }
  }
  async remove(actor: Actor, kind: Kind, id: string, expectedVersion: number) {
    return this.rt.transaction([], async tx => {
      await this.rt.actor(tx, actor, 'REGISTRAR'); const p = await this.find(kind, id, tx); if (p.version !== expectedVersion) stale(p.version);
      if (kind === 'students') {
        const terms = await tx.$queryRaw<{ id: string; closeState: string }[]>`SELECT id, "closeState" FROM "Term" ORDER BY id FOR UPDATE`;
        if (terms.some(t => t.closeState === 'CLOSING' || this.rt.gates.status(t.id) === 'CLOSING')) throw new ApiError(409, 'CLOSING', '关闭处理中不能删除人员');
      }
      const records = kind === 'students' ? await tx.schedule.count({ where: { studentId: id } }) + await tx.registration.count({ where: { studentId: id } }) + await tx.gradeRecord.count({ where: { studentId: id } }) + await tx.billingOutbox.count({ where: { studentId: id } }) + await tx.catalogNotice.count({ where: { studentId: id } }) : await tx.teachingHistory.count({ where: { professorId: id } }) + await tx.offering.count({ where: { professorId: id } }) + await tx.qualification.count({ where: { professorId: id } });
      if (records) throw new ApiError(409, 'HAS_RECORDS', '此人员有业务历史，不能删除，请修改状态或停用账户');
      if (p.account) {
        await tx.session.deleteMany({ where: { accountId: p.account.id } });
        await tx.account.delete({ where: { id: p.account.id } });
      }
      await tx.personIdentity.delete({ where: { ssn: p.ssn } });
      if (kind === 'students') await tx.student.delete({ where: { id } });
      else { await tx.teachingVersion.deleteMany({ where: { professorId: id } }); await tx.professor.delete({ where: { id } }); }
      await this.rt.audit(tx, actor, 'person.delete', kind, id);
      return { deleted: true };
    });
  }
}
