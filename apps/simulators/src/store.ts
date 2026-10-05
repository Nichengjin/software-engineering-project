import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  billingMessageSchema,
  catalogSnapshotSchema,
  catalogSeedSchema,
  type BillingMessage,
  type CatalogSnapshot,
  type BillingAck,
} from '@wylie/contracts';

const stateSchema = z.object({
  formatVersion: z.literal(1),
  revision: z.number().int().nonnegative().safe(),
  catalogs: z.array(catalogSnapshotSchema),
  messages: z.array(billingMessageSchema),
}).strict();

type State = z.infer<typeof stateSchema>;

export class InvalidBillingPayload extends Error {}
export class InvalidCatalogPayload extends Error {}

// Fixed two-decimal integers keep totals and multiplication exact, including zero.
function hundredths(value: string): bigint {
  if (!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(value)) {
    throw new InvalidBillingPayload('Invalid decimal');
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function validateBilling(message: BillingMessage): void {
  if ([message.termId, message.studentId].some((id) => id.includes(':')) ||
      !Number.isSafeInteger(message.version) || message.version < 1 ||
      message.businessId !== `${message.termId}:${message.studentId}:${message.version}`) {
    throw new InvalidBillingPayload('Invalid business ID');
  }
  if (!message.studentName.trim() || !message.studentNumber.trim() || message.offerings.length > 4) {
    throw new InvalidBillingPayload('Invalid student identity or schedule');
  }
  const offerings = new Set<string>();
  const courses = new Set<string>();
  let total = 0n;
  for (const offering of message.offerings) {
    if (!offering.courseName.trim() || offerings.has(offering.offeringId) || courses.has(offering.courseId)) {
      throw new InvalidBillingPayload('Duplicate course or offering');
    }
    offerings.add(offering.offeringId);
    courses.add(offering.courseId);
    const credits = hundredths(offering.credits);
    if (credits === 0n) throw new InvalidBillingPayload('Credits must be positive');
    total += credits;
  }
  const price = hundredths(message.pricePerCreditYuan);
  const amount = hundredths(message.amountYuan);
  // Sum credits first, then round the nonnegative total to cents once (half-up).
  const expectedAmount = (total * price + 50n) / 100n;
  if (total !== hundredths(message.totalCredits) ||
      expectedAmount !== amount) {
    throw new InvalidBillingPayload('Inconsistent billing amount');
  }
}

// Normalize property order, but preserve array order and decimal string content.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function persist(path: string, state: State): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(state));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
    const directory = await open(dirname(path), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export function validateCatalogs(catalogs: CatalogSnapshot[]): void {
  const terms = new Set<string>();
  const offeringIds = new Set<string>();
  for (const catalog of catalogs) {
    catalogSnapshotSchema.parse(catalog);
    if (terms.has(catalog.termId)) throw new Error('Duplicate catalog term');
    terms.add(catalog.termId);
    for (const course of catalog.courses) {
      if (hundredths(course.credits) === 0n ||
          new Set(course.prerequisiteCourseIds).size !== course.prerequisiteCourseIds.length ||
          course.prerequisiteCourseIds.includes(course.id)) {
        throw new Error('Invalid catalog prerequisite or credits');
      }
    }
    for (const offering of catalog.offerings) {
      if (offeringIds.has(offering.id)) throw new Error('Offering ID is not unique across terms');
      offeringIds.add(offering.id);
    }
  }
}

export class SimulatorStore {
  private queue: Promise<unknown> = Promise.resolve();
  private failed = false;

  private constructor(private readonly path: string, private state: State) {}

  static async load(statePath: string, seedPath: string): Promise<SimulatorStore> {
    // Even on restart, require an explicit, valid seed source rather than fabricate IDs.
    const seed = catalogSeedSchema.parse(JSON.parse(await readFile(seedPath, 'utf8')));
    if (!seed.catalogs.length) throw new Error('Seed must explicitly define at least one term');
    validateCatalogs(seed.catalogs);
    const revisions = seed.catalogs.map((catalog) => Number(catalog.revision));
    if (seed.catalogs.some((catalog) => !/^\d+$/.test(catalog.revision)) ||
        revisions.some((revision) => !Number.isSafeInteger(revision) || revision < 0)) {
      throw new Error('Seed revision must be a nonnegative safe integer string');
    }
    let state: State;
    try {
      state = stateSchema.parse(JSON.parse(await readFile(statePath, 'utf8')));
      validateCatalogs(state.catalogs);
      if (state.catalogs.some((catalog) => !/^\d+$/.test(catalog.revision) ||
          !Number.isSafeInteger(Number(catalog.revision)) || Number(catalog.revision) > state.revision)) {
        throw new Error('Invalid persisted revision counter');
      }
      const ids = new Set<string>();
      for (const message of state.messages) {
        validateBilling(message);
        if (ids.has(message.businessId)) throw new Error('Duplicate persisted business ID');
        ids.add(message.businessId);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      state = { formatVersion: 1, revision: Math.max(...revisions), catalogs: seed.catalogs, messages: [] };
      await persist(statePath, state);
    }
    return new SimulatorStore(statePath, state);
  }

  snapshot(termId: string): CatalogSnapshot | undefined {
    this.ensureAvailable();
    return structuredClone(this.state.catalogs.find((catalog) => catalog.termId === termId));
  }

  bills(termId: string, studentId: string) {
    this.ensureAvailable();
    const messages = this.state.messages.filter((message) =>
      message.termId === termId && message.studentId === studentId);
    const latest = messages.reduce<BillingMessage | undefined>((result, message) =>
      !result || message.version > result.version ? message : result, undefined);
    return {
      latestVersion: latest?.version ?? 0,
      latestAmountYuan: latest?.amountYuan ?? '0.00',
      acceptedBusinessIds: messages.map((message) => message.businessId),
    };
  }

  private ensureAvailable(): void {
    if (this.failed) throw new Error('Simulator persistence unavailable; restart required');
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() => {
      this.ensureAvailable();
      return operation();
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async commit(state: State): Promise<void> {
    try {
      await persist(this.path, state);
      this.state = state;
    } catch (error) {
      // A rename/fsync failure has an uncertain disk outcome. Do not overwrite it
      // with a later in-memory state or acknowledge additional writes.
      this.failed = true;
      throw error;
    }
  }

  updateCatalog(update: Omit<CatalogSnapshot, 'revision'>): Promise<void> {
    return this.serialize(async () => {
      if (this.state.revision === Number.MAX_SAFE_INTEGER) throw new Error('Revision exhausted');
      const revision = this.state.revision + 1;
      const catalogs = this.state.catalogs.filter((catalog) => catalog.termId !== update.termId);
      catalogs.push({ ...structuredClone(update), revision: String(revision) });
      try {
        validateCatalogs(catalogs);
      } catch {
        throw new InvalidCatalogPayload('Invalid complete catalog');
      }
      await this.commit({ ...this.state, revision, catalogs });
    });
  }

  accept(message: BillingMessage): Promise<BillingAck> {
    return this.serialize(async () => {
      validateBilling(message);
      const existing = this.state.messages.find((item) => item.businessId === message.businessId);
      if (existing && canonical(existing) !== canonical(message)) {
        throw new InvalidBillingPayload('Business ID already has different content');
      }
      const latestVersion = this.bills(message.termId, message.studentId).latestVersion;
      const outcome = existing ? 'DUPLICATE' : message.version < latestVersion ? 'STALE' : 'APPLIED';
      if (!existing) {
        await this.commit({ ...this.state, messages: [...this.state.messages, structuredClone(message)] });
      }
      return { businessId: message.businessId, version: message.version, outcome,
        latestVersion: Math.max(latestVersion, message.version) };
    });
  }
}
