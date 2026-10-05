import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { billingAckSchema, billingMessageSchema, catalogSeedSchema, catalogSnapshotSchema, dateSchema, gradeWriteSchema, meetingSchema, moneySchema, responseSchemas, scheduleWriteSchema, simFaultsSchema, studentCreateSchema, studentPatchSchema } from './index.js';

describe('strict shared HTTP contracts', () => {
  it('does not accept ownership fields, missing alternatives or negative versions', () => {
    const write = { primaryOfferingIds: ['external-a'], alternateOfferingIds: [], expectedVersion: 0 };
    expect(scheduleWriteSchema.parse(write)).toEqual(write);
    expect(scheduleWriteSchema.safeParse({ ...write, studentId: 'another-student' }).success).toBe(false);
    expect(scheduleWriteSchema.safeParse({ primaryOfferingIds: [], expectedVersion: 0 }).success).toBe(false);
    expect(scheduleWriteSchema.safeParse({ ...write, expectedVersion: -1 }).success).toBe(false);
  });
  it('preserves invalid grade cells for individual results, but rejects duplicate students', () => {
    const cells = [{ studentId: 'a', grade: 'Z' }, { studentId: 'b', grade: '' }, { studentId: 'c', grade: null }];
    expect(gradeWriteSchema.parse({ cells }).cells).toEqual(cells);
    expect(gradeWriteSchema.safeParse({ cells: [...cells, { studentId: 'a', grade: 'A' }] }).success).toBe(false);
  });
  it('preserves SSN text and defaults creation enablement without permitting role/number edits', () => {
    const created = studentCreateSchema.parse({ name: ' fictional ', birthDate: '2004-02-29', ssn: '000012345', status: 'ACTIVE', graduationDate: null });
    expect(created.ssn).toBe('000012345');
    expect(created.accountEnabled).toBe(true);
    expect(studentPatchSchema.parse({ name: 'changed' })).toEqual({ name: 'changed' });
    expect(studentPatchSchema.safeParse({ studentNumber: 'S999999' }).success).toBe(false);
    expect(dateSchema.safeParse('2005-02-29').success).toBe(false);
  });
  it('validates both time/date ranges, including 1440 and leap-day boundaries', () => {
    const meeting = { dayOfWeek: 7, startMinute: 1430, endMinute: 1440, fromDate: '2024-02-29', throughDate: '2024-03-01' };
    expect(meetingSchema.safeParse(meeting).success).toBe(true);
    for (const invalid of [{ ...meeting, endMinute: 1430 }, { ...meeting, dayOfWeek: 0 }, { ...meeting, throughDate: '2024-02-28' }]) expect(meetingSchema.safeParse(invalid).success).toBe(false);
  });
  it('keeps decimal strings exact and rejects exponent, float number and excess precision', () => {
    expect(moneySchema.parse('1234.56')).toBe('1234.56');
    for (const invalid of ['1e3', 12.5, '12.345', '-0.01']) expect(moneySchema.safeParse(invalid).success).toBe(false);
  });
  it('rejects unsafe bill versions and timer overflow rather than rounding/sending immediately', () => {
    const ack = { businessId: 't:s:1', version: 1, outcome: 'APPLIED', latestVersion: 1 };
    expect(billingAckSchema.safeParse(ack).success).toBe(true);
    expect(billingAckSchema.safeParse({ ...ack, version: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);
    expect(billingAckSchema.safeParse({ ...ack, latestVersion: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);
    const bill = { businessId: 't:s:1', studentId: 's', studentNumber: 'S1', studentName: 'fictional', termId: 't', version: 1, closedAt: '2026-10-05T00:00:00Z', offerings: [], totalCredits: '0.00', pricePerCreditYuan: '100.00', amountYuan: '0.00' };
    expect(billingMessageSchema.safeParse(bill).success).toBe(true);
    expect(billingMessageSchema.safeParse({ ...bill, version: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);
    expect(simFaultsSchema.safeParse({ catalog: { mode: 'timeout', delayMs: 120000 }, billing: { mode: 'normal', delayMs: 0 } }).success).toBe(true);
    expect(simFaultsSchema.safeParse({ catalog: { mode: 'timeout', delayMs: 120001 }, billing: { mode: 'normal', delayMs: 0 } }).success).toBe(false);
  });
  it('loads the shared fictional fixture and refuses authority/reference corruption', async () => {
    const seed = catalogSeedSchema.parse(JSON.parse(await readFile(new URL('../../db/seed/catalog.json', import.meta.url), 'utf8')));
    expect(seed.catalogs).toHaveLength(4);
    expect(seed.catalogs[2]?.courses).toHaveLength(8);
    const snapshot = seed.catalogs[2]!;
    expect(catalogSnapshotSchema.safeParse({ ...snapshot, offerings: [{ ...snapshot.offerings[0], termId: 'wrong-term' }] }).success).toBe(false);
    expect(catalogSnapshotSchema.safeParse({ ...snapshot, courses: [...snapshot.courses, snapshot.courses[0]] }).success).toBe(false);
    expect(catalogSnapshotSchema.safeParse({ ...snapshot, localProfessor: 'forged' }).success).toBe(false);
  });
  it('covers every HTTP data response shape without exposing credentials through personnel queries', () => {
    expect(Object.keys(responseSchemas)).toHaveLength(26);
    const person = { id: 's', account: 'S1', version: 1, name: 'Fictional', birthDate: '2000-01-01', ssnMasked: '***1234', accountEnabled: true, kind: 'STUDENT', status: 'ACTIVE', graduationDate: null };
    expect(responseSchemas.person.safeParse({ person }).success).toBe(true);
    expect(responseSchemas.person.safeParse({ person: { ...person, initialPassword: 'should-not-leak' } }).success).toBe(false);
  });
});
