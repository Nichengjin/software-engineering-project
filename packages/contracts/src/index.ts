import { z } from 'zod';

export const idSchema = z.string().min(1).max(200).regex(/^[^:\s]+$/);
export const instantSchema = z.string().datetime();
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}, 'Invalid calendar date');
export const moneySchema = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/);
export const creditsSchema = z.string().regex(/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/);
export const versionSchema = z.number().int().safe().nonnegative();
export const roleSchema = z.enum(['STUDENT', 'PROFESSOR', 'REGISTRAR']);
export const gradeSchema = z.enum(['A', 'B', 'C', 'D', 'F', 'I']);
export const studentStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'GRADUATED']);
export const professorStatusSchema = z.enum(['ACTIVE', 'DEPARTED']);
export const closeStateSchema = z.enum(['OPEN', 'CLOSING', 'CLOSED']);
export const phaseSchema = z.enum(['BEFORE_TEACHING', 'TEACHING', 'INITIAL', 'GAP', 'ADD_DROP', 'AWAITING_CLOSE', 'CLOSING', 'CLOSED']);
export const offeringStatusSchema = z.enum(['OPEN', 'CLOSED', 'CANCELLED']);
export const registrationSourceSchema = z.enum(['SUBMIT', 'LEVELING', 'SUPPLEMENT']);
export const billingStatusSchema = z.enum(['PENDING', 'IN_FLIGHT', 'RETRY', 'ACKNOWLEDGED', 'SUPERSEDED']);
export const gradeSourceSchema = z.enum(['PROFESSOR', 'IMPORT']);
export const issueSchema = z.object({
  field: z.string().optional(), offeringId: idSchema.optional(), studentId: idSchema.optional(),
  row: z.number().int().positive().optional(), code: z.string().min(1), message: z.string(),
}).strict();
export const failureSchema = z.object({
  error: z.object({ code: z.string().min(1), message: z.string(), issues: z.array(issueSchema), currentVersion: versionSchema.optional(), retryable: z.boolean() }).strict(),
  requestId: z.string().min(1),
}).strict();
export const successSchema = <T extends z.ZodTypeAny>(data: T) => z.object({ data, requestId: z.string().min(1), serverTime: instantSchema }).strict();
export type ID = string;
export type Instant = string;
export type Role = z.infer<typeof roleSchema>;
export type Grade = z.infer<typeof gradeSchema>;
export type StudentStatus = z.infer<typeof studentStatusSchema>;
export type ProfessorStatus = z.infer<typeof professorStatusSchema>;
export type CloseState = z.infer<typeof closeStateSchema>;
export type Phase = z.infer<typeof phaseSchema>;
export type Issue = z.infer<typeof issueSchema>;
export type Failure = z.infer<typeof failureSchema>;
export type Success<T> = { data: T; requestId: string; serverTime: Instant };

export const userSchema = z.object({ id: idSchema, account: z.string().min(1), name: z.string(), role: roleSchema, personId: idSchema.nullable(), mustChangePassword: z.boolean() }).strict();
export const authSchema = z.object({ user: userSchema, csrfToken: z.string().min(1), expiresAt: instantSchema }).strict();
export const passwordSchema = z.string().min(10).max(128);
export const loginSchema = z.object({ account: z.string().min(1), password: z.string().min(1).max(128) }).strict();
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }).strict();
export const logoutSchema = z.object({}).strict();
export type User = z.infer<typeof userSchema>;
export type Auth = z.infer<typeof authSchema>;
export type Login = z.infer<typeof loginSchema>;
export type ChangePassword = z.infer<typeof changePasswordSchema>;

const windowsShape = {
  teachingStartsAt: instantSchema, initialStartsAt: instantSchema, initialEndsAt: instantSchema,
  addDropStartsAt: instantSchema, addDropEndsAt: instantSchema,
};
export const termWindowsSchema = z.object({ expectedVersion: versionSchema, ...windowsShape }).strict();
export const termSchema = z.object({
  id: idSchema, name: z.string(), ordinal: z.number().int(), startsAt: instantSchema, endsAt: instantSchema,
  isLaunchTerm: z.boolean(), version: versionSchema, ...windowsShape, phase: phaseSchema, closeState: closeStateSchema,
  closedAt: instantSchema.nullable(), lastCloseError: z.object({ code: z.string(), message: z.string() }).strict().nullable(),
}).strict();
export const meetingSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7), startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440), fromDate: dateSchema, throughDate: dateSchema,
}).strict().refine((m) => m.startMinute < m.endMinute, { message: 'Meeting end must follow start', path: ['endMinute'] })
  .refine((m) => m.fromDate <= m.throughDate, { message: 'Meeting date range is reversed', path: ['throughDate'] });
export const offeringSchema = z.object({
  id: idSchema, termId: idSchema, courseId: idSchema, courseName: z.string(), department: z.string(),
  credits: creditsSchema, prerequisiteCourseIds: z.array(idSchema), meetings: z.array(meetingSchema),
  professor: z.object({ id: idSchema, name: z.string() }).strict().nullable(), enrolledCount: z.number().int().nonnegative(),
  capacity: z.literal(10), status: offeringStatusSchema, eligibleToTeach: z.boolean().optional(),
}).strict();
export const catalogSchema = z.object({ termId: idSchema, revision: z.string().min(1), observedAt: instantSchema, offerings: z.array(offeringSchema) }).strict();
export const noticeSchema = z.object({
  id: idSchema, offeringId: idSchema, relatedOfferingId: idSchema.nullable(), kind: z.enum(['TIME_CONFLICT', 'PREREQUISITE', 'OFFERING_DELETED']),
  message: z.string(), resolved: z.boolean(), createdAt: instantSchema,
}).strict();
export type Term = z.infer<typeof termSchema>;
export type TermWindows = z.infer<typeof termWindowsSchema>;
export type Meeting = z.infer<typeof meetingSchema>;
export type Offering = z.infer<typeof offeringSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type Notice = z.infer<typeof noticeSchema>;

const choicesShape = { primaryOfferingIds: z.array(idSchema), alternateOfferingIds: z.array(idSchema) };
// Quantity, duplication, prerequisites and time conflicts remain business rules (HTTP 422),
// not structural parsing failures (HTTP 400). Saved drafts may be incomplete.
export const choicesSchema = z.object(choicesShape).strict();
export const scheduleWriteSchema = z.object({ ...choicesShape, expectedVersion: versionSchema }).strict();
export const confirmedVersionSchema = z.object({ expectedVersion: versionSchema, confirmed: z.literal(true) }).strict();
export const scheduleSchema = z.object({
  studentId: idSchema, termId: idSchema, version: versionSchema, exists: z.boolean(), firstSubmittedAt: instantSchema.nullable(),
  saved: choicesSchema, submitted: choicesSchema.nullable(),
  registrations: z.array(z.object({ offeringId: idSchema, source: registrationSourceSchema, state: z.enum(['ENROLLED', 'COMMITTED']) }).strict()),
}).strict();
export const reportRowSchema = z.object({ courseId: idSchema, courseName: z.string(), offeringId: idSchema.nullable(), grade: gradeSchema.nullable(), source: gradeSourceSchema }).strict();
export type Choices = z.infer<typeof choicesSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type ScheduleWrite = z.infer<typeof scheduleWriteSchema>;
export type ReportRow = z.infer<typeof reportRowSchema>;

export const teachingSchema = z.object({ termId: idSchema, version: versionSchema, offeringIds: z.array(idSchema) }).strict();
export const teachingWriteSchema = z.object({ expectedVersion: versionSchema, offeringIds: z.array(idSchema) }).strict();
export const rosterRowSchema = z.object({ studentId: idSchema, studentNumber: z.string().min(1), name: z.string(), grade: gradeSchema.nullable() }).strict();
export const gradeCellSchema = z.object({ studentId: idSchema, grade: z.string().nullable() }).strict();
export const gradeWriteSchema = z.object({ cells: z.array(gradeCellSchema) }).strict().refine((v) => new Set(v.cells.map((c) => c.studentId)).size === v.cells.length, { message: 'Duplicate studentId', path: ['cells'] });
export const gradeResultSchema = z.object({ studentId: idSchema, outcome: z.enum(['SAVED', 'UNCHANGED', 'REJECTED']), grade: gradeSchema.nullable(), issue: issueSchema.nullable() }).strict();
export type Teaching = z.infer<typeof teachingSchema>;
export type TeachingWrite = z.infer<typeof teachingWriteSchema>;
export type RosterRow = z.infer<typeof rosterRowSchema>;
export type GradeCell = z.infer<typeof gradeCellSchema>;
export type GradeResult = z.infer<typeof gradeResultSchema>;

const personShape = { name: z.string().trim().min(1), birthDate: dateSchema, ssn: z.string().min(1).max(64), accountEnabled: z.boolean() };
const studentShape = { ...personShape, status: studentStatusSchema, graduationDate: dateSchema.nullable() };
const professorShape = { ...personShape, status: professorStatusSchema, department: z.string().trim().min(1) };
export const personInputSchema = z.object(personShape).strict();
export const studentInputSchema = z.object(studentShape).strict();
export const professorInputSchema = z.object(professorShape).strict();
export const studentCreateSchema = studentInputSchema.extend({ accountEnabled: z.boolean().default(true) });
export const professorCreateSchema = professorInputSchema.extend({ accountEnabled: z.boolean().default(true) });
export const studentPatchSchema = studentInputSchema.partial();
export const professorPatchSchema = professorInputSchema.partial();
const personViewShape = { id: idSchema, account: z.string().min(1), version: versionSchema, name: z.string(), birthDate: dateSchema, ssnMasked: z.string(), accountEnabled: z.boolean() };
export const personViewSchema = z.discriminatedUnion('kind', [
  z.object({ ...personViewShape, kind: z.literal('STUDENT'), status: studentStatusSchema, graduationDate: dateSchema.nullable() }).strict(),
  z.object({ ...personViewShape, kind: z.literal('PROFESSOR'), status: professorStatusSchema, department: z.string() }).strict(),
]);
export const impactSchema = z.object({
  personVersion: versionSchema, impactToken: z.string().min(1), expiresAt: instantSchema,
  terms: z.array(z.object({ termId: idSchema, offeringIds: z.array(idSchema), clearSchedule: z.boolean(), retainedClosedRecords: z.boolean() }).strict()),
}).strict();
export const studentImpactPreviewSchema = z.object({ expectedVersion: versionSchema, patch: studentPatchSchema }).strict();
export const professorImpactPreviewSchema = z.object({ expectedVersion: versionSchema, patch: professorPatchSchema }).strict();
export const studentUpdateSchema = studentImpactPreviewSchema.extend({ confirmed: z.literal(true).optional(), impactToken: z.string().min(1).optional() });
export const professorUpdateSchema = professorImpactPreviewSchema.extend({ confirmed: z.literal(true).optional(), impactToken: z.string().min(1).optional() });
export const peopleQuerySchema = z.object({ q: z.string().optional(), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).strict();
export const initialCredentialSchema = z.object({ account: z.string().min(1), initialPassword: passwordSchema }).strict();
export type PersonInput = z.infer<typeof personInputSchema>;
export type StudentInput = z.infer<typeof studentInputSchema>;
export type ProfessorInput = z.infer<typeof professorInputSchema>;
export type PersonView = z.infer<typeof personViewSchema>;
export type Impact = z.infer<typeof impactSchema>;
export type StudentUpdate = z.infer<typeof studentUpdateSchema>;
export type ProfessorUpdate = z.infer<typeof professorUpdateSchema>;

export const closeResultSchema = z.object({
  termId: idSchema, closedAt: instantSchema,
  cancelledOfferings: z.array(z.object({ offeringId: idSchema, reason: z.enum(['NO_PROFESSOR', 'UNDER_MINIMUM', 'CATALOG_DELETED']) }).strict()),
  leveled: z.array(z.object({ studentId: idSchema, offeringId: idSchema, alternateIndex: z.number().int().nonnegative() }).strict()),
  unresolved: z.array(z.object({ studentId: idSchema, issues: z.array(issueSchema) }).strict()),
  billing: z.object({ pending: z.number().int().nonnegative(), acknowledged: z.number().int().nonnegative(), superseded: z.number().int().nonnegative() }).strict(),
}).strict();
export const billingSummarySchema = z.object({
  studentId: idSchema, termId: idSchema, version: z.number().int().positive(), businessId: z.string().min(1), amountYuan: moneySchema,
  status: billingStatusSchema, attempts: z.number().int().nonnegative(), nextAttemptAt: instantSchema.nullable(), lastErrorCode: z.string().nullable(),
}).strict();
export const closeSchema = z.object({ confirmed: z.literal(true) }).strict();
export const supplementSchema = z.object({ studentId: idSchema, offeringId: idSchema, expectedVersion: versionSchema, confirmed: z.literal(true) }).strict();
export type CloseResult = z.infer<typeof closeResultSchema>;
export type BillingSummary = z.infer<typeof billingSummarySchema>;
export type Supplement = z.infer<typeof supplementSchema>;

export const importKindSchema = z.enum(['students', 'professors', 'historical-grades', 'qualifications']);
export const importRowSchema = z.object({ row: z.number().int().min(2), outcome: z.enum(['IMPORTED', 'SKIPPED', 'REJECTED']), account: z.string().optional(), initialPassword: passwordSchema.optional(), issues: z.array(issueSchema) }).strict();
export const importResultSchema = z.object({ kind: importKindSchema, imported: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), rejected: z.number().int().nonnegative(), rows: z.array(importRowSchema) }).strict();
export const historicalGradeImportSchema = z.object({ studentNumber: z.string().min(1), courseId: idSchema, termId: idSchema, grade: gradeSchema }).strict();
export const qualificationImportSchema = z.object({ professorNumber: z.string().min(1), courseId: idSchema }).strict();
export const studentImportSchema = studentInputSchema.omit({ accountEnabled: true }).extend({ graduationDate: dateSchema.nullable().optional() });
export const professorImportSchema = professorInputSchema.omit({ accountEnabled: true });
export const importLimits = { compressedBytes: 5 * 1024 * 1024, expandedBytes: 20 * 1024 * 1024, rows: 5000, columns: 50 } as const;
export const importColumns = {
  students: { required: ['name', 'birthDate', 'ssn', 'status'], optional: ['graduationDate'] },
  professors: { required: ['name', 'birthDate', 'ssn', 'status', 'department'], optional: [] },
  'historical-grades': { required: ['studentNumber', 'courseId', 'termId', 'grade'], optional: [] },
  qualifications: { required: ['professorNumber', 'courseId'], optional: [] },
} as const;
export type ImportKind = z.infer<typeof importKindSchema>;
export type ImportRow = z.infer<typeof importRowSchema>;
export type ImportResult = z.infer<typeof importResultSchema>;

export const courseSchema = z.object({ id: idSchema, name: z.string().min(1), department: z.string().min(1), credits: creditsSchema, prerequisiteCourseIds: z.array(idSchema) }).strict();
export const externalOfferingSchema = z.object({ id: idSchema, courseId: idSchema, termId: idSchema, meetings: z.array(meetingSchema) }).strict();
export const catalogUpdateSchema = z.object({ termId: idSchema, courses: z.array(courseSchema), offerings: z.array(externalOfferingSchema) }).strict();
export const catalogSnapshotSchema = catalogUpdateSchema.extend({ revision: z.string().min(1) }).superRefine((snapshot, ctx) => {
  const courseIds = new Set(snapshot.courses.map((c) => c.id));
  if (courseIds.size !== snapshot.courses.length) ctx.addIssue({ code: 'custom', path: ['courses'], message: 'Duplicate course ID' });
  if (new Set(snapshot.offerings.map((o) => o.id)).size !== snapshot.offerings.length) ctx.addIssue({ code: 'custom', path: ['offerings'], message: 'Duplicate offering ID' });
  for (const [i, course] of snapshot.courses.entries()) {
    if (course.prerequisiteCourseIds.some((id) => !courseIds.has(id))) ctx.addIssue({ code: 'custom', path: ['courses', i, 'prerequisiteCourseIds'], message: 'Unknown prerequisite course' });
  }
  for (const [i, offering] of snapshot.offerings.entries()) {
    if (offering.termId !== snapshot.termId || !courseIds.has(offering.courseId)) ctx.addIssue({ code: 'custom', path: ['offerings', i], message: 'Offering term or course mismatch' });
  }
});
export const catalogSeedSchema = z.object({ catalogs: z.array(catalogSnapshotSchema) }).strict();
export const billingMessageSchema = z.object({
  businessId: z.string().min(1), studentId: idSchema, studentNumber: z.string().min(1), studentName: z.string(), termId: idSchema,
  version: z.number().int().safe().positive(), closedAt: instantSchema,
  offerings: z.array(z.object({ offeringId: idSchema, courseId: idSchema, courseName: z.string(), credits: creditsSchema }).strict()),
  totalCredits: moneySchema, pricePerCreditYuan: moneySchema, amountYuan: moneySchema,
}).strict();
export const billingAckSchema = z.object({ businessId: z.string().min(1), version: z.number().int().safe().positive(), outcome: z.enum(['APPLIED', 'DUPLICATE', 'STALE']), latestVersion: z.number().int().safe().positive() }).strict();
export const simFaultsSchema = z.object({
  catalog: z.object({ mode: z.enum(['normal', 'unavailable', 'timeout']), delayMs: z.number().int().min(0).max(120_000) }).strict(),
  billing: z.object({ mode: z.enum(['normal', 'unavailable', 'timeout', 'drop-after-accept']), delayMs: z.number().int().min(0).max(120_000) }).strict(),
}).strict();
export const simBillsSchema = z.object({ latestVersion: z.number().int().safe().nonnegative(), latestAmountYuan: moneySchema, acceptedBusinessIds: z.array(z.string()) }).strict();
export type Course = z.infer<typeof courseSchema>;
export type ExternalOffering = z.infer<typeof externalOfferingSchema>;
export type CatalogUpdate = z.infer<typeof catalogUpdateSchema>;
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;
export type CatalogSeed = z.infer<typeof catalogSeedSchema>;
export type BillingMessage = z.infer<typeof billingMessageSchema>;
export type BillingAck = z.infer<typeof billingAckSchema>;
export type SimFaults = z.infer<typeof simFaultsSchema>;

// All business response data shapes, before Success<T> wrapping.
export const responseSchemas = {
  auth: authSchema,
  logout: z.object({ loggedOut: z.literal(true) }).strict(),
  live: z.object({ status: z.literal('ok') }).strict(),
  ready: z.object({ status: z.literal('ready') }).strict(),
  terms: z.object({ terms: z.array(termSchema), currentTermId: idSchema, previousCompletedTermId: idSchema.nullable(), launchTermId: idSchema }).strict(),
  windows: z.object({ term: termSchema }).strict(),
  catalog: catalogSchema,
  notices: z.object({ notices: z.array(noticeSchema) }).strict(),
  schedule: z.object({ schedule: scheduleSchema }).strict(),
  reportCard: z.object({ term: termSchema.nullable(), rows: z.array(reportRowSchema) }).strict(),
  teaching: z.object({ teaching: teachingSchema }).strict(),
  offerings: z.object({ offerings: z.array(offeringSchema) }).strict(),
  roster: z.object({ offering: offeringSchema, students: z.array(rosterRowSchema) }).strict(),
  gradeContext: z.object({ term: termSchema.nullable(), offerings: z.array(offeringSchema) }).strict(),
  grades: z.object({ results: z.array(gradeResultSchema) }).strict(),
  people: z.object({ items: z.array(personViewSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100) }).strict(),
  person: z.object({ person: personViewSchema }).strict(),
  createdPerson: z.object({ person: personViewSchema, initialCredential: initialCredentialSchema }).strict(),
  impact: z.object({ impact: impactSchema }).strict(),
  deletedPerson: z.object({ deleted: z.literal(true) }).strict(),
  closeAccepted: z.object({ termId: idSchema, closeState: z.literal('CLOSING') }).strict(),
  closeResult: z.object({ term: termSchema, result: closeResultSchema.nullable() }).strict(),
  billing: z.object({ items: z.array(billingSummarySchema) }).strict(),
  supplementContext: z.object({ student: personViewSchema, schedule: scheduleSchema, catalog: catalogSchema }).strict(),
  supplement: z.object({ schedule: scheduleSchema, billing: billingSummarySchema }).strict(),
  imports: importResultSchema,
} as const;
