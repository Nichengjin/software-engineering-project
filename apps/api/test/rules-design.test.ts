import { describe, it, expect } from 'vitest';
import { overlaps, choiceIssues, phase, studentWindow, validWindows, tuition, grades, passing, type Meeting } from '../src/rules.js';

// 用例编号与 docs/testing/test-design-methods.md 中的等价类、边界值和覆盖表一一对应。
const ids = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const counts = (p: number, a: number, first?: boolean) =>
  choiceIssues({ primaryOfferingIds: ids(p, 'P'), alternateOfferingIds: ids(a, 'A') }, first).map(i => i.code);

describe('黑盒：主选／备选数量的等价类与边界值', () => {
  it.each([
    ['EC-N1 首次 4+2', 4, 2, []],
    ['EC-N2 首次主选 3（下边界外）', 3, 2, ['CHOICE_COUNT']],
    ['EC-N3 首次主选 5（上边界外）', 5, 2, ['CHOICE_COUNT']],
    ['EC-N4 首次备选 1（下边界外）', 4, 1, ['CHOICE_COUNT']],
    ['EC-N5 首次备选 3（上边界外）', 4, 3, ['CHOICE_COUNT']],
  ] as const)('%s', (_, p, a, expected) => { expect(counts(p, a, true)).toEqual(expected); });

  it.each([
    ['EC-N6 后续主选 1（下边界）', 1, 0, []],
    ['EC-N6 后续主选 4（上边界）', 4, 2, []],
    ['EC-N7 后续主选 0（下边界外）', 0, 0, ['CHOICE_COUNT']],
    ['EC-N8 后续主选 5（上边界外）', 5, 0, ['CHOICE_COUNT']],
    ['EC-N9 后续备选 2（上边界）', 2, 2, []],
    ['EC-N10 后续备选 3（上边界外）', 2, 3, ['CHOICE_COUNT']],
  ] as const)('%s', (_, p, a, expected) => { expect(counts(p, a, false)).toEqual(expected); });

  it.each([
    ['EC-N11 保存 0+0（允许空表）', 0, 0, []],
    ['EC-N11 保存 4+2（上边界）', 4, 2, []],
    ['EC-N12 保存主选 5（上边界外）', 5, 0, ['CHOICE_COUNT']],
    ['EC-N12 保存备选 3（上边界外）', 0, 3, ['CHOICE_COUNT']],
  ] as const)('%s', (_, p, a, expected) => { expect(counts(p, a)).toEqual(expected); });

  it('EC-N13／N14 同一班次在主选中重复、或同时作主选和备选，均为无效类；互不相同为有效类', () => {
    expect(choiceIssues({ primaryOfferingIds: ['M1', 'M1'], alternateOfferingIds: [] }).map(i => i.code)).toEqual(['DUPLICATE_OFFERING']);
    expect(choiceIssues({ primaryOfferingIds: ['M1'], alternateOfferingIds: ['M1'] }).map(i => i.code)).toEqual(['DUPLICATE_OFFERING']);
    expect(choiceIssues({ primaryOfferingIds: ['M1'], alternateOfferingIds: ['M2'] })).toEqual([]);
  });

  it('EC-N2＋N13 同时违反两类规则时两个问题都报告', () => {
    expect(choiceIssues({ primaryOfferingIds: ['M1', 'M1'], alternateOfferingIds: [] }, true).map(i => i.code)).toEqual(['CHOICE_COUNT', 'DUPLICATE_OFFERING']);
  });
});

describe('黑盒：学期阶段窗口的边界值（左闭右开）', () => {
  // 0 授课选择开始，100 初选开始，200 初选结束，300 加退选开始，400 加退选结束。
  const t = { closeState: 'OPEN', teachingStartsAt: new Date(0), initialStartsAt: new Date(100), initialEndsAt: new Date(200), addDropStartsAt: new Date(300), addDropEndsAt: new Date(400) };
  it.each([
    [-1, 'BEFORE_TEACHING', false], [0, 'TEACHING', false], [99, 'TEACHING', false],
    [100, 'INITIAL', true], [199, 'INITIAL', true], [200, 'GAP', false], [299, 'GAP', false],
    [300, 'ADD_DROP', true], [399, 'ADD_DROP', true], [400, 'AWAITING_CLOSE', false],
  ] as const)('BV-W 时刻 %i 处于 %s，学生可写=%s', (ms, expectedPhase, writable) => {
    expect(phase(t, new Date(ms))).toBe(expectedPhase);
    expect(studentWindow(t, new Date(ms))).toBe(writable);
  });
  it.each(['CLOSING', 'CLOSED'])('EC-W 学期状态 %s 优先于时间，学生不可写', state => {
    expect(phase({ ...t, closeState: state }, new Date(150))).toBe(state);
  });
  it('BV-W 窗口顺序：相邻阶段允许首尾相接，同一阶段起止相等无效', () => {
    expect(validWindows({ ...t, initialStartsAt: new Date(0) })).toBe(true);
    expect(validWindows({ ...t, addDropStartsAt: new Date(200) })).toBe(true);
    expect(validWindows({ ...t, initialEndsAt: new Date(100) })).toBe(false);
    expect(validWindows({ ...t, addDropEndsAt: new Date(300) })).toBe(false);
    expect(validWindows({ ...t, teachingStartsAt: new Date(101) })).toBe(false);
  });
});

describe('黑盒：成绩取值与先修及格的等价类', () => {
  it('EC-G1 有效成绩 A／B／C／D／F／I；EC-G2 其他取值（含小写、Z、E）无效', () => {
    for (const g of ['A', 'B', 'C', 'D', 'F', 'I']) expect(grades.has(g)).toBe(true);
    for (const g of ['a', 'Z', 'E', 'A+', '']) expect(grades.has(g)).toBe(false);
  });
  it('EC-P1 及格成绩 A—D 满足先修；EC-P2 F 与 I 不满足', () => {
    expect([...passing].sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(passing.has('F')).toBe(false); expect(passing.has('I')).toBe(false);
  });
});

describe('黑盒：学费金额的边界值', () => {
  it('BV-M 先累加学分再一次舍入，0.005 元进位，空课表为 0 元', () => {
    expect(tuition(['0.01'], '0.50').amountYuan).toBe('0.01');
    expect(tuition(['0.01'], '0.49').amountYuan).toBe('0.00');
    expect(tuition([], '125.00')).toEqual({ totalCredits: '0.00', amountYuan: '0.00' });
    expect(tuition(['3', '3', '3', '3'], '125.00').amountYuan).toBe('1500.00');
  });
  it('EC-M 学分格式无效类（负数、指数、三位小数）被拒绝', () => {
    for (const bad of ['-1', '1e2', '1.234']) expect(() => tuition([bad], '125.00')).toThrow();
  });
});

describe('白盒：overlaps() 逻辑覆盖', () => {
  // 判定 D1：星期不同 C1 ‖ x 开始≥y 结束 C2 ‖ y 开始≥x 结束 C3；D2：日期区间无交集 C4；D3：交集内出现该星期 C5。
  const m = (over: Partial<Meeting> = {}): Meeting => ({ dayOfWeek: 1, startMinute: 600, endMinute: 660, fromDate: '2026-10-01', throughDate: '2026-10-31', ...over });
  it.each([
    ['L1 C1=T：星期不同', [m()], [m({ dayOfWeek: 2 })], false],
    ['L2 C1=F C2=T：x 在 y 结束时开始（首尾相接）', [m({ startMinute: 660, endMinute: 720 })], [m()], false],
    ['L3 C1=F C2=F C3=T：y 在 x 结束后开始', [m()], [m({ startMinute: 700, endMinute: 760 })], false],
    ['L4 D1=F D2=T：时段重叠但日期区间不相交', [m({ throughDate: '2026-10-05' })], [m({ fromDate: '2026-10-12' })], false],
    ['L5 D1=F D2=F D3=F：日期交集只有周二到周五，不含周一', [m({ fromDate: '2026-10-06', throughDate: '2026-10-09' })], [m()], false],
    ['L6 D1=F D2=F D3=T：交集内有周一，冲突', [m({ startMinute: 659, endMinute: 720 })], [m()], true],
    ['L7 D3 边界：交集只有一天且正好是周一', [m({ fromDate: '2026-10-05', throughDate: '2026-10-05' })], [m()], true],
    ['L8 循环覆盖：第一对不冲突、第二对冲突', [m({ dayOfWeek: 3 }), m()], [m({ dayOfWeek: 5 }), m({ startMinute: 630, endMinute: 690 })], true],
    ['L9 循环覆盖：任一侧为空', [], [m()], false],
    ['L10 星期日换算分支：交集从周日开始（getUTCDay()=0 记为 7）', [m({ dayOfWeek: 7, fromDate: '2026-10-04' })], [m({ dayOfWeek: 7 })], true],
    ['L11 条件组合 TTF：星期不同，且 x 在 y 之后', [m({ dayOfWeek: 2, startMinute: 660, endMinute: 720 })], [m()], false],
    ['L12 条件组合 TFT：星期不同，且 y 在 x 之后', [m()], [m({ dayOfWeek: 2, startMinute: 700, endMinute: 760 })], false],
  ] as const)('%s', (_, a, b, expected) => {
    expect(overlaps([...a], [...b])).toBe(expected);
    expect(overlaps([...b], [...a])).toBe(expected);
  });
});
