import { studentCreateSchema, professorCreateSchema, historicalGradeImportSchema, qualificationImportSchema, type ImportKind, type ImportRow, type StudentInput, type ProfessorInput } from '@wylie/contracts';
import { ZodError } from 'zod';
import type { Grade } from '@prisma/client';
import { Runtime, type Actor } from '../../runtime/context.js';
import { PeopleService } from '../people/service.js';
import { parseXlsx } from './xlsx.js';
import { ApiError } from '../../errors.js';

export class ImportService {
  constructor(readonly rt: Runtime, readonly people: PeopleService) {}
  async run(actor: Actor, kind: ImportKind, buffer: Buffer) {
    await this.rt.actor(this.rt.db, actor, 'REGISTRAR');
    const parsed = await parseXlsx(kind, buffer); const rows: ImportRow[] = [];
    const context = await this.rt.termContext();
    const catalog = ['historical-grades','qualifications'].includes(kind) ? await this.rt.external.catalog(context.current.id) : null;
    for (const row of parsed) {
      try {
        if (row.error) throw new ApiError(400, 'INVALID_INPUT', row.error);
        if (kind === 'students' || kind === 'professors') {
          const value = kind === 'students' ? studentCreateSchema.parse({ ...row.values, graduationDate: row.values.graduationDate || null }) : professorCreateSchema.parse(row.values);
          const created = await this.people.create(actor, kind, value as StudentInput | ProfessorInput);
          rows.push({ row: row.row, outcome: 'IMPORTED', account: created.initialCredential.account, initialPassword: created.initialCredential.initialPassword, issues: [] });
        } else {
          const result = await this.rt.transaction([], async tx => {
            await this.rt.actor(tx, actor, 'REGISTRAR');
            if (kind === 'historical-grades') {
              const value = historicalGradeImportSchema.parse(row.values); const term = await this.rt.term(tx, value.termId);
              if (term.ordinal >= context.launch.ordinal) throw new ApiError(422, 'RULE_VIOLATION', '只能导入系统上线学期以前的成绩');
              const course = catalog!.courses.find(c => c.id === value.courseId); if (!course) throw new ApiError(422, 'RULE_VIOLATION', '权威目录中没有该课程');
              const student = await tx.student.findUnique({ where: { studentNumber: value.studentNumber } }); if (!student) throw new ApiError(404, 'NOT_FOUND', '学生不存在');
              const key = { studentId: student.id, courseId: value.courseId, termId: term.id };
              if (await tx.gradeRecord.findUnique({ where: { studentId_courseId_termId: key } })) return 'SKIPPED' as const;
              await tx.gradeRecord.create({ data: { ...key, value: value.grade as Grade, source: 'IMPORT', courseNameSnapshot: course.name, updatedByAccountId: actor.accountId } });
            } else {
              const value = qualificationImportSchema.parse(row.values);
              if (!catalog!.courses.some(c => c.id === value.courseId)) throw new ApiError(422, 'RULE_VIOLATION', '权威目录中没有该课程');
              const professor = await tx.professor.findUnique({ where: { professorNumber: value.professorNumber } }); if (!professor) throw new ApiError(404, 'NOT_FOUND', '教授不存在');
              const key = { professorId: professor.id, courseId: value.courseId };
              if (await tx.qualification.findUnique({ where: { professorId_courseId: key } })) return 'SKIPPED' as const;
              await tx.qualification.create({ data: key });
            }
            await this.rt.audit(tx, actor, `import.${kind}`, 'ImportRow', String(row.row));
            return 'IMPORTED' as const;
          });
          rows.push({ row: row.row, outcome: result, issues: [] });
        }
      } catch (error) {
        const duplicate = error instanceof ApiError && error.code === 'HAS_RECORDS' || typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
        if (!duplicate && !(error instanceof ApiError) && !(error instanceof ZodError)) throw error;
        const code = duplicate ? 'DUPLICATE' : error instanceof ApiError ? error.code : 'INVALID_INPUT';
        rows.push({ row: row.row, outcome: duplicate ? 'SKIPPED' : 'REJECTED', issues: [{ row: row.row, code, message: error instanceof ApiError ? error.message : duplicate ? '已存在，跳过' : '此行字段无效' }] });
        await this.rt.failAudit(actor, `import.${kind}`, String(row.row), code);
      }
    }
    return { kind, imported: rows.filter(r => r.outcome === 'IMPORTED').length, skipped: rows.filter(r => r.outcome === 'SKIPPED').length, rejected: rows.filter(r => r.outcome === 'REJECTED').length, rows };
  }
}
