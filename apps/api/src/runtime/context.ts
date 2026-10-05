import { Prisma, type PrismaClient, type Account, type Term } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Gates } from './gate.js';
import type { External } from './external.js';
import { ApiError } from '../errors.js';
import { phase } from '../rules.js';

export type Tx = Prisma.TransactionClient;
export type Actor = { accountId: string; requestId: string };
export type Hook = 'submit.beforeConfirm' | 'close.afterGate' | 'close.afterDrain' | 'close.afterLeveling' | 'close.beforeCommit' | 'billing.afterSendBeforeAckPersist';
export type Config = { publicOrigin: string; secureCookie: boolean; csrfSigningKey: string; impactSigningKey: string; pricePerCreditYuan: string };
export type Dependencies = { db: PrismaClient; external: External; config: Config; clock?: () => Date; fault?: (name: Hook) => Promise<void>; log?: (entry: Record<string, unknown>) => void };
export const activeRegistration = { state: { in: ['ENROLLED', 'COMMITTED'] as ('ENROLLED' | 'COMMITTED')[] } };
export const json = (value: unknown) => value as Prisma.InputJsonValue;

export class Runtime {
  readonly gates = new Gates();
  ready = false;
  readonly tasks = new Set<Promise<unknown>>();
  constructor(readonly deps: Dependencies) {}
  get db() { return this.deps.db; }
  get external() { return this.deps.external; }
  get config() { return this.deps.config; }
  log(entry: Record<string, unknown>) { (this.deps.log ?? (e => console.info(JSON.stringify(e))))(entry); }
  async now(tx: Tx = this.db): Promise<Date> {
    if (this.deps.clock) return this.deps.clock();
    const rows = await tx.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp() AS at`;
    return rows[0]!.at;
  }
  hook(name: Hook) { return this.deps.fault?.(name) ?? Promise.resolve(); }
  transaction<T>(termIds: string[], fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(710001::bigint)`;
      for (const termId of [...new Set(termIds)].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${termId}, 710002))`;
      return fn(tx);
    }, { timeout: 30000, maxWait: 30000 });
  }
  async audit(tx: Tx, actor: Actor | null, action: string, objectType: string, objectId: string, result = 'SUCCESS', errorCode?: string, details: unknown = {}) {
    await tx.auditEvent.create({ data: { requestId: actor?.requestId ?? randomUUID(), actorAccountId: actor?.accountId ?? null, processName: actor ? null : 'background', action, objectType, objectId, result, errorCode: errorCode ?? null, minimalDetails: json(details), at: await this.now(tx) } });
  }
  async failAudit(actor: Actor | null, action: string, objectId: string, errorCode: string) {
    try { await this.audit(this.db, actor, action, 'request', objectId, 'FAILED', errorCode); }
    catch { this.log({ requestId: actor?.requestId, errorCode, auditPersistence: 'FAILED' }); }
  }
  async term(tx: Tx, termId: string): Promise<Term> {
    const term = await tx.term.findUnique({ where: { id: termId } });
    if (!term) throw new ApiError(404, 'NOT_FOUND', '学期不存在');
    return term;
  }
  async actor(tx: Tx, actor: Actor, role?: Account['role']) {
    const account = await tx.account.findUnique({ where: { id: actor.accountId }, include: { student: true, professor: true } });
    if (!account || !account.enabled || account.professor?.status === 'DEPARTED') throw new ApiError(403, 'ACCOUNT_DISABLED', '账户不可用');
    if (role && account.role !== role) throw new ApiError(403, 'FORBIDDEN', '无此操作权限');
    if (account.mustChangePassword) throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', '请先修改初始密码');
    if (role === 'STUDENT' && account.student?.status !== 'ACTIVE') throw new ApiError(403, 'FORBIDDEN', '当前学生状态仅允许查看成绩');
    return account;
  }
  async termView(term: Term) {
    return { id: term.id, name: term.name, ordinal: term.ordinal, startsAt: term.startsAt.toISOString(), endsAt: term.endsAt.toISOString(), isLaunchTerm: term.isLaunchTerm, version: term.version, teachingStartsAt: term.teachingStartsAt.toISOString(), initialStartsAt: term.initialStartsAt.toISOString(), initialEndsAt: term.initialEndsAt.toISOString(), addDropStartsAt: term.addDropStartsAt.toISOString(), addDropEndsAt: term.addDropEndsAt.toISOString(), phase: phase(term, await this.now()), closeState: term.closeState, closedAt: term.closedAt?.toISOString() ?? null, lastCloseError: term.lastCloseError };
  }
  async termContext(tx: Tx = this.db) {
    const now = await this.now(tx); const terms = await tx.term.findMany({ orderBy: { ordinal: 'asc' } });
    const launch = terms.find(t => t.isLaunchTerm);
    if (!launch) throw new ApiError(503, 'RECOVERING', '学期元数据尚未初始化');
    const previous = terms.filter(t => t.endsAt <= now).at(-1) ?? null;
    const current = terms.find(t => t.startsAt <= now && now < t.endsAt) ?? terms.find(t => t.endsAt > now) ?? terms.at(-1)!;
    return { terms, launch, previous, current };
  }
  spawn(task: Promise<unknown>) {
    this.tasks.add(task); void task.finally(() => this.tasks.delete(task)).catch(() => {});
  }
  async settle() { await Promise.all([...this.tasks]); }
}
