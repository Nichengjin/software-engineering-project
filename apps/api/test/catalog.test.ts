import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from '../src/modules/catalog/service.js';
import { Runtime } from '../src/runtime/context.js';
import { Gates } from '../src/runtime/gate.js';
import type { Snapshot } from '../src/runtime/external.js';

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const snapshot = (termId: string, revision: string): Snapshot => ({ termId, revision, courses: [], offerings: [] });
function setup() {
  const calls: { termId: string; result: ReturnType<typeof deferred<Snapshot>> }[] = [];
  const gates = new Gates();
  const external = { catalog: vi.fn((termId: string) => {
    const result = deferred<Snapshot>(); calls.push({ termId, result }); return result.promise;
  }) };
  const db = { offering: { findMany: vi.fn().mockResolvedValue([]) }, qualification: { findMany: vi.fn().mockResolvedValue([]) },
    catalogSnapshot: { findUnique: vi.fn().mockResolvedValue({ observedAt: new Date('2026-10-07T00:00:00Z') }) } };
  const service = new CatalogService({ gates, external, db, term: vi.fn().mockResolvedValue({ closeState: 'OPEN' }) } as unknown as Runtime);
  const apply = vi.spyOn(service, 'apply').mockResolvedValue(undefined);
  vi.spyOn(service, 'assertRevision').mockResolvedValue(undefined);
  return { service, calls, gates, apply, external };
}

describe('目录按学期合并下一轮刷新，不复用请求到达前开始的拉取', () => {
  it('只读查询共用请求到达后开始的下一轮，教授视角隔离且从不触发应用', async () => {
    const { service, calls, apply } = setup();
    const first = service.view('A');
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const waiting = Array.from({ length: 2000 }, () => service.view('A'));
    const professor = service.view('A', 'P1');
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    calls[1]!.result.resolve(snapshot('A', 'professor')); await professor;
    calls[0]!.result.resolve(snapshot('A', 'old')); expect((await first).revision).toBe('old');
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    calls[2]!.result.resolve(snapshot('A', 'new'));
    expect((await Promise.all(waiting)).map(value => value.revision)).toEqual(Array(2000).fill('new'));
    expect(apply).not.toHaveBeenCalled();
  });

  it('2000个在首轮HTTP期间到达的调用共用下一轮；下一轮开始后到达的调用再等新一轮', async () => {
    const { service, calls, apply } = setup();
    const first = service.fresh('A');
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const waiting = Array.from({ length: 2000 }, () => service.fresh('A'));
    calls[0]!.result.resolve(snapshot('A', 'old'));
    expect((await first).revision).toBe('old');
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    let laterDone = false;
    const later = service.fresh('A').then(value => { laterDone = true; return value; });
    calls[1]!.result.resolve(snapshot('A', 'new'));
    expect((await Promise.all(waiting)).map(value => value.revision)).toEqual(Array(2000).fill('new'));
    expect(laterDone).toBe(false);
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    calls[2]!.result.resolve(snapshot('A', 'newest'));
    expect((await later).revision).toBe('newest');
    expect(apply.mock.calls.map(([value]) => value.revision)).toEqual(['old', 'new', 'newest']);
  });

  it('等待写库完成才发布该轮结果；不同学期可以独立拉取', async () => {
    const { service, calls, apply } = setup();
    const applying = deferred<void>();
    apply.mockImplementationOnce(() => applying.promise);
    let done = false;
    const first = service.fresh('A').then(value => { done = true; return value; });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    calls[0]!.result.resolve(snapshot('A', '1'));
    await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce());
    const next = service.fresh('A'); const other = service.fresh('B');
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.termId).toBe('B');
    calls[1]!.result.resolve(snapshot('B', '9'));
    expect((await other).termId).toBe('B'); expect(done).toBe(false);
    applying.resolve(); await first;
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    calls[2]!.result.resolve(snapshot('A', '2')); await next;
  });

  it.each(['HTTP', 'apply'])('一轮%s失败拒绝全部等待者，下一轮和失败后新请求仍可继续', async kind => {
    const { service, calls, apply } = setup();
    const failure = new Error(kind);
    if (kind === 'apply') apply.mockRejectedValueOnce(failure);
    const first = service.fresh('A'); const joined = service.fresh('A');
    const rejected = Promise.all([expect(first).rejects.toThrow(kind), expect(joined).rejects.toThrow(kind)]);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const next = service.fresh('A');
    if (kind === 'HTTP') calls[0]!.result.reject(failure);
    else calls[0]!.result.resolve(snapshot('A', '1'));
    await rejected;
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    calls[1]!.result.resolve(snapshot('A', '2')); expect((await next).revision).toBe('2');
    const retry = service.fresh('A');
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    calls[2]!.result.resolve(snapshot('A', '3')); expect((await retry).revision).toBe('3');
  });

  it('后台先排下一轮、已准入写随后加入时，关闭后仍应用该轮，drain等准入者释放', async () => {
    const { service, calls, gates, apply } = setup();
    const running = service.fresh('A');
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const background = service.fresh('A');
    const token = gates.admit('A'); const admitted = service.fresh('A', token);
    gates.beginClose('A'); let drained = false;
    const drain = gates.drain('A').then(() => { drained = true; });
    calls[0]!.result.resolve(snapshot('A', '1')); await running;
    expect(apply).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    calls[1]!.result.resolve(snapshot('A', '2')); await Promise.all([background, admitted]);
    expect(apply.mock.calls.map(([value]) => value.revision)).toEqual(['2']);
    expect(drained).toBe(false); token.release(); await drain;
  });

  it('关闭期间后台刷新不应用，但显式关闭刷新必须应用；后台应用期间持有自己的准入', async () => {
    const { service, calls, gates, apply } = setup();
    const applying = deferred<void>(); apply.mockImplementationOnce(() => applying.promise);
    const open = service.fresh('A');
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    calls[0]!.result.resolve(snapshot('A', '1'));
    await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce());
    gates.beginClose('A'); let drained = false;
    const drain = gates.drain('A').then(() => { drained = true; });
    await Promise.resolve(); expect(drained).toBe(false);
    applying.resolve(); await open; await drain;
    const background = service.fresh('A');
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    calls[1]!.result.resolve(snapshot('A', '2')); await background;
    expect(apply).toHaveBeenCalledOnce();
    const closing = service.fresh('A', undefined, true);
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    calls[2]!.result.resolve(snapshot('A', '3')); await closing;
    expect(apply.mock.calls.map(([value]) => value.revision)).toEqual(['1', '3']);
  });
});
