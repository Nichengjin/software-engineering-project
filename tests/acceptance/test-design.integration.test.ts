import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CloseResult } from '@wylie/contracts';
import { choices, createFixture, type Fixture } from './fixture.js';

// 白盒基本路径测试：apps/api/src/modules/terms/close.ts 中关闭选课的备选调剂循环。
// 流图有 5 个判定（P1 还有学生、P2 还有备选、P3 已满四门、P4 备选已注册、P5 备选不可用），
// V(G) = 5 + 1 = 6，下列 6 条独立路径与 docs/testing/test-design-methods.md 第 4 节对应。
describe('白盒：关闭调剂循环的基本路径（V(G)=6）', () => {
  let f: Fixture;
  beforeEach(async () => { f = await createFixture(); }, 60000);
  afterEach(async () => { await f?.dispose(); }, 60000);
  async function leveled() {
    const result = (await f.db.term.findUniqueOrThrow({ where: { id: f.ids.T2 } })).closeResult as unknown as CloseResult;
    return result.leveled.filter(r => r.studentId === f.students[0]!.id).map(r => [r.offeringId, r.alternateIndex]);
  }
  async function registeredDirectly(index: number, offeringId: string) {
    await f.db.registration.create({ data: { studentId: f.students[index]!.id, offeringId, source: 'SUBMIT' } });
  }

  it('路径 1：P1=F，没有任何已提交课表，循环一次也不进入', async () => {
    await registeredDirectly(0, 'M1');
    await f.close();
    const result = (await f.db.term.findUniqueOrThrow({ where: { id: f.ids.T2 } })).closeResult as unknown as CloseResult;
    expect(result.leveled).toEqual([]);
  });

  it('路径 2：P1=T、P2=F，学生没有备选，不调剂', async () => {
    await f.register(0, ['M1', 'M2', 'M3'], []);
    await f.close();
    expect(await leveled()).toEqual([]);
  });

  it('路径 3：P2=T、P3=T，已满四门，第一项备选前即退出', async () => {
    await f.register(0, ['M1', 'M2', 'M3', 'M4'], ['B1', 'B2']);
    await f.close();
    expect(await leveled()).toEqual([]);
    expect(await f.members('B1')).not.toContain('S101');
  });

  it('路径 4：P3=F、P4=T，备选已是有效注册（防御性分支，正常提交不可达，直接构造数据），跳过后用下一项', async () => {
    await f.register(0, ['M1', 'M2'], ['B1', 'B2']);
    await registeredDirectly(0, 'B1');
    await f.close();
    expect(await leveled()).toEqual([['B2', 1]]);
    expect(await f.db.registration.count({ where: { studentId: f.students[0]!.id, offeringId: 'B1' } })).toBe(1);
  });

  it('路径 5：P4=F、P5=T，唯一备选已取消，不调剂', async () => {
    await f.db.offering.update({ where: { externalOfferingId: 'B2' }, data: { status: 'CANCELLED' } });
    await f.register(0, ['M1', 'M2', 'M3'], ['B2']);
    await f.close();
    expect(await leveled()).toEqual([]);
  });

  it('路径 6：P5=F，备选可用，写入调剂注册', async () => {
    // 两名背景学生让 B1 调剂后达到 3 人，不因不足三人被取消。
    await registeredDirectly(20, 'B1'); await registeredDirectly(21, 'B1');
    await f.register(0, ['M1', 'M2', 'M3'], ['B1']);
    await f.close();
    expect(await leveled()).toEqual([['B1', 0]]);
    expect(await f.members('B1')).toContain('S101');
  });
});

// 黑盒：班次容量的边界值。容量判断排除学生本人（apps/api/src/modules/catalog/service.ts）。
describe('黑盒：班次容量边界（上限 10 人）', () => {
  let f: Fixture;
  beforeEach(async () => { f = await createFixture(); }, 60000);
  afterEach(async () => { await f?.dispose(); }, 60000);
  const submit = (version: number, primary: string[], i = 0) =>
    f.application.schedules.write(f.actor(f.students[i]!.accountId), f.ids.T2, version, choices(primary, []), 'SUBMIT');
  async function others(offeringId: string, n: number) {
    await f.db.registration.createMany({ data: f.students.slice(10, 10 + n).map(s => ({ studentId: s.id, offeringId, source: 'SUBMIT' as const })) });
  }

  it('BV-C1 已有 9 人（上边界内）：第 10 人提交成功', async () => {
    await others('B1', 9); await f.register(0, ['M1']);
    await submit(1, ['M1', 'B1']);
    expect(await f.members('B1')).toHaveLength(10);
  });

  it('BV-C2 已有 10 人（上边界外）：第 11 人被拒绝，原注册不变', async () => {
    await others('B1', 10); await f.register(0, ['M1']);
    await expect(submit(1, ['M1', 'B1'])).rejects.toMatchObject({ code: 'OFFERING_FULL' });
    expect(await f.members('B1')).toHaveLength(10);
    expect((await f.application.schedules.view(f.students[0]!.id, f.ids.T2)).registrations.map(r => r.offeringId)).toEqual(['M1']);
  });

  it('BV-C3 本人已在满 10 人的班次中：保留该班并调整其他课程，不被判为额满', async () => {
    await others('B1', 9); await f.register(0, ['B1', 'M1']);
    expect(await f.members('B1')).toHaveLength(10);
    await submit(1, ['B1', 'M2']);
    expect((await f.application.schedules.view(f.students[0]!.id, f.ids.T2)).registrations.map(r => r.offeringId)).toEqual(['B1', 'M2']);
    expect(await f.members('B1')).toHaveLength(10);
  });
});
