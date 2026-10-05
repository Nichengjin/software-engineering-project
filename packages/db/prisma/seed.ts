import { PrismaClient, Prisma, type Grade } from '@prisma/client';
import { catalogSeedSchema, billingMessageSchema, closeResultSchema, type Choices } from '@wylie/contracts';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { demoCatalogSeed, demoCourses, demoTerms } from '../seed/fixtures.js';

const prisma = new PrismaClient();
const root = fileURLToPath(new URL('../../../', import.meta.url));
const credentialPath = resolve(root, process.env.DEMO_CREDENTIALS_PATH || '.local/demo-credentials.json');
const empty: Choices = { primaryOfferingIds: [], alternateOfferingIds: [] };
type Credential = { account: string; initialPassword: string; role: string; name: string };
const credentials: Credential[] = [];
function credential(role: string, name: string, account: string) {
  const initialPassword = randomBytes(24).toString('base64url');
  const salt = randomBytes(16);
  const hash = scryptSync(initialPassword, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  credentials.push({ account, initialPassword, role, name });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function windows(term: typeof demoTerms[number]) {
  const year = term.from.slice(0, 4);
  if (term.ordinal === 3) return { teachingStartsAt: '2026-09-01T00:00:00Z', initialStartsAt: '2026-09-15T00:00:00Z', initialEndsAt: '2026-10-07T10:00:00Z', addDropStartsAt: '2026-10-08T00:00:00Z', addDropEndsAt: '2026-10-20T10:00:00Z' };
  const month = term.ordinal === 1 ? '08' : '01';
  return { teachingStartsAt: `${year}-${month}-01T00:00:00Z`, initialStartsAt: `${year}-${month}-08T00:00:00Z`, initialEndsAt: `${year}-${month}-15T00:00:00Z`, addDropStartsAt: `${year}-${month}-16T00:00:00Z`, addDropEndsAt: `${year}-${month}-28T00:00:00Z` };
}
try {
  // Never reset, overwrite users, or rotate existing passwords. Only a pristine demo DB is seeded.
  const counts = await Promise.all([prisma.account.count(), prisma.term.count(), prisma.student.count(), prisma.professor.count(), prisma.courseMirror.count()]);
  if (counts.some((count) => count !== 0)) {
    console.log('Seed skipped: database already initialized; existing records and credentials were not changed.');
  } else {
    catalogSeedSchema.parse(demoCatalogSeed);
    const trackedSeed = catalogSeedSchema.parse(JSON.parse(await readFile(new URL('../seed/catalog.json', import.meta.url), 'utf8')));
    if (!isDeepStrictEqual(trackedSeed, demoCatalogSeed)) throw new Error('Catalog fixture JSON is stale; run db:fixtures');
    await mkdir(new URL('../../../.local/', import.meta.url), { recursive: true, mode: 0o700 });
    // Reserve an exclusive private file BEFORE commit. Credentials cannot leak via default umask.
    const file = await open(credentialPath, 'wx', 0o600);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(827001)`;
        if (await tx.account.count() !== 0 || await tx.term.count() !== 0) throw new Error('Database initialized concurrently; seed aborted');
        for (const term of demoTerms) {
          const snapshot = demoCatalogSeed.catalogs.find((c) => c.termId === term.id)!;
          const closed = term.ordinal <= 2;
          await tx.term.create({ data: {
            id: term.id, name: term.name, ordinal: term.ordinal, startsAt: new Date(`${term.from}T00:00:00Z`), endsAt: new Date(`${term.through}T00:00:00Z`), isLaunchTerm: term.isLaunchTerm,
            ...Object.fromEntries(Object.entries(windows(term)).map(([key, value]) => [key, new Date(value)])) as { teachingStartsAt: Date; initialStartsAt: Date; initialEndsAt: Date; addDropStartsAt: Date; addDropEndsAt: Date },
            closeState: closed ? 'CLOSED' : 'OPEN', closedAt: closed ? new Date(`${term.from}T00:00:00Z`) : null,
            closedCatalogSnapshot: closed ? snapshot as unknown as Prisma.InputJsonValue : Prisma.DbNull,
            pricePerCreditYuan: closed ? '100.00' : null,
          } });
          await tx.catalogSnapshot.create({ data: { termId: term.id, revision: snapshot.revision, payload: snapshot as unknown as Prisma.InputJsonValue, observedAt: new Date() } });
          for (const offering of snapshot.offerings) {
            const cancelled = closed && !(term.ordinal === 2 && offering.courseId === 'MATH101');
            await tx.offering.create({ data: { externalOfferingId: offering.id, termId: term.id, courseId: offering.courseId, status: cancelled ? 'CANCELLED' : closed ? 'CLOSED' : 'OPEN', cancelReason: cancelled ? offering.courseId === 'BIO101' ? 'NO_PROFESSOR' : 'UNDER_MINIMUM' : null } });
          }
        }
        for (const course of demoCourses) await tx.courseMirror.create({ data: { externalCourseId: course.id, name: course.name, department: course.department, credits: course.credits, prerequisiteIds: course.prerequisiteCourseIds, revision: '1' } });
        await tx.account.create({ data: { account: 'registrar', role: 'REGISTRAR', passwordHash: credential('REGISTRAR', '演示教务员', 'registrar') } });
        const professors = [];
        for (let i = 0; i < 4; i++) {
          const professor = await tx.professor.create({ data: { name: `虚构教授${i + 1}`, birthDate: new Date('1980-02-12T00:00:00Z'), ssn: `DEMO-P-${String(i + 1).padStart(4, '0')}`, department: i < 2 ? '科学部' : '人文部', status: i === 3 ? 'DEPARTED' : 'ACTIVE' } });
          professors.push(professor);
          await tx.personIdentity.create({ data: { ssn: professor.ssn, professorId: professor.id } });
          await tx.account.create({ data: { account: professor.professorNumber, role: 'PROFESSOR', professorId: professor.id, enabled: i !== 3, passwordHash: credential('PROFESSOR', professor.name, professor.professorNumber) } });
          for (const course of demoCourses) await tx.qualification.create({ data: { professorId: professor.id, courseId: course.id } });
          for (const term of demoTerms) await tx.teachingVersion.create({ data: { professorId: professor.id, termId: term.id, version: 1 } });
        }
        // Seven taught offerings + one teacherless offering in each term; no pre-enrollment in current term.
        for (const term of demoTerms) {
          for (let i = 0; i < demoCourses.length - 1; i++) {
            const professor = professors[i % 3]!;
            const offeringId = `T${term.ordinal}-${demoCourses[i]!.id}-A`;
            await tx.offering.update({ where: { externalOfferingId: offeringId }, data: { professorId: professor.id } });
            await tx.teachingHistory.create({ data: { professorId: professor.id, offeringId } });
          }
        }
        for (let i = 0; i < 14; i++) {
          const status = i === 12 ? 'SUSPENDED' : i === 13 ? 'GRADUATED' : 'ACTIVE';
          const student = await tx.student.create({ data: { name: `虚构学生${i + 1}`, birthDate: new Date('2005-03-14T00:00:00Z'), ssn: `DEMO-S-${String(i + 1).padStart(4, '0')}`, status, graduationDate: status === 'GRADUATED' ? new Date('2026-07-15T00:00:00Z') : null } });
          await tx.personIdentity.create({ data: { ssn: student.ssn, studentId: student.id } });
          await tx.account.create({ data: { account: student.studentNumber, role: 'STUDENT', studentId: student.id, passwordHash: credential('STUDENT', student.name, student.studentNumber) } });
          const historyGrade: Grade = i % 3 === 0 ? 'F' : 'B';
          await tx.gradeRecord.create({ data: { studentId: student.id, termId: demoTerms[0].id, courseId: 'MATH101', value: historyGrade, source: 'IMPORT', courseNameSnapshot: '离散数学' } });
          // Only first ten students took the previous-term offering; capacity remains ten.
          if (i < 10) {
            const choices: Choices = { primaryOfferingIds: ['T2-MATH101-A'], alternateOfferingIds: [] };
            await tx.schedule.create({ data: { studentId: student.id, termId: demoTerms[1].id, exists: true, version: 1, firstSubmittedAt: new Date('2026-01-09T00:00:00Z'), savedChoices: choices, submittedChoices: choices } });
            await tx.registration.create({ data: { studentId: student.id, offeringId: 'T2-MATH101-A', source: 'SUBMIT', state: 'COMMITTED' } });
            await tx.gradeRecord.create({ data: { studentId: student.id, termId: demoTerms[1].id, courseId: 'MATH101', offeringId: 'T2-MATH101-A', value: i === 0 ? null : i % 2 ? 'A' : 'I', source: 'PROFESSOR', courseNameSnapshot: '离散数学' } });
          } else {
            await tx.schedule.create({ data: { studentId: student.id, termId: demoTerms[1].id, savedChoices: empty, version: 1 } });
          }
          const termId = demoTerms[1].id;
          const bill = billingMessageSchema.parse({
            businessId: `${termId}:${student.id}:1`, studentId: student.id, studentNumber: student.studentNumber, studentName: student.name,
            termId, version: 1, closedAt: '2026-02-01T00:00:00Z',
            offerings: i < 10 ? [{ offeringId: 'T2-MATH101-A', courseId: 'MATH101', courseName: '离散数学', credits: '3.00' }] : [],
            totalCredits: i < 10 ? '3.00' : '0.00', pricePerCreditYuan: '100.00', amountYuan: i < 10 ? '300.00' : '0.00',
          });
          await tx.billingOutbox.create({ data: { studentId: student.id, termId, version: 1, businessId: bill.businessId, payload: bill, amountYuan: bill.amountYuan } });
          // Every current schedule starts at the persistent zero-version tombstone.
          await tx.schedule.create({ data: { studentId: student.id, termId: demoTerms[2].id, savedChoices: empty } });
        }
        const result = closeResultSchema.parse({
          termId: demoTerms[1].id, closedAt: '2026-02-01T00:00:00Z',
          cancelledOfferings: demoCourses.filter((c) => c.id !== 'MATH101').map((c) => ({ offeringId: `T2-${c.id}-A`, reason: c.id === 'BIO101' ? 'NO_PROFESSOR' : 'UNDER_MINIMUM' })),
          leveled: [], unresolved: [], billing: { pending: 14, acknowledged: 0, superseded: 0 },
        });
        await tx.term.update({ where: { id: demoTerms[1].id }, data: { closeResult: result } });
        await file.writeFile(`${JSON.stringify({ generatedAt: new Date().toISOString(), credentials }, null, 2)}\n`);
        await file.sync();
      }, { timeout: 60_000 });
      console.log('Fictional demo data initialized; initial passwords are ONLY in the local credentials file (mode 600).');
    } catch (error) {
      // A failed Prisma transaction is rolled back; remove only the file reserved by this run.
      await file.close();
      await unlink(credentialPath);
      throw error;
    } finally { await file.close(); }
  }
} finally { await prisma.$disconnect(); }
