import { describe, it, expect } from 'vitest';
import { randomBytes, scryptSync } from 'node:crypto';
import { overlaps, choiceIssues, tuition, studentWindow } from '../src/rules.js';
import { Gates } from '../src/runtime/gate.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

describe('规则与准入', () => {
  const meeting = { dayOfWeek: 1, startMinute: 600, endMinute: 660, fromDate: '2026-10-01', throughDate: '2026-10-31' };
  it('实际同星期日期重叠；相邻时间、不同周和无该星期日期不冲突', () => {
    expect(overlaps([meeting], [{ ...meeting, startMinute: 659, endMinute: 710 }])).toBe(true);
    expect(overlaps([meeting], [{ ...meeting, startMinute: 660, endMinute: 710 }])).toBe(false);
    expect(overlaps([{ ...meeting, throughDate: '2026-10-05' }], [{ ...meeting, fromDate: '2026-10-12' }])).toBe(false);
    expect(overlaps([{ ...meeting, throughDate: '2026-10-03' }], [meeting])).toBe(false);
  });
  it('首次4+2，删除重建仍首次；备选与主选同班拒绝', () => {
    expect(choiceIssues({ primaryOfferingIds: ['a','b','c'], alternateOfferingIds: ['d','e'] }, true)).toHaveLength(1);
    expect(choiceIssues({ primaryOfferingIds: ['a','b','c'], alternateOfferingIds: [] }, false)).toHaveLength(0);
    expect(choiceIssues({ primaryOfferingIds: ['a'], alternateOfferingIds: ['a'] })).toHaveLength(1);
  });
  it('精确金额累计与一次舍入', () => {
    expect(tuition(['1.25', '2.30'], '123.45')).toEqual({ totalCredits: '3.55', amountYuan: '438.25' });
    expect(tuition(['1.75', '1.75'], '125.55')).toEqual({ totalCredits: '3.50', amountYuan: '439.43' });
    expect(tuition(['0.01', '0.01'], '0.25').amountYuan).toBe('0.01');
    expect(tuition([], '123.45').amountYuan).toBe('0.00');
  });
  it('自然截止右端不可确认', () => {
    const t = { closeState:'OPEN', teachingStartsAt:new Date(0), initialStartsAt:new Date(100), initialEndsAt:new Date(200), addDropStartsAt:new Date(300), addDropEndsAt:new Date(400) };
    expect(studentWindow(t, new Date(399))).toBe(true);
    expect(studentWindow(t, new Date(400))).toBe(false);
    expect(studentWindow(t, new Date(250))).toBe(false);
  });
  it('提前关闭拒绝新请求，等待已经准入任务结束', async () => {
    const gate = new Gates(); const admitted = gate.admit('t');
    gate.beginClose('t'); expect(() => gate.admit('t')).toThrow();
    let drained = false; const drain = gate.drain('t').then(() => { drained = true; });
    await Promise.resolve(); expect(drained).toBe(false);
    admitted.release(); admitted.release(); await drain; expect(drained).toBe(true);
  });
  it('scrypt随机盐，错误密码不匹配', async () => {
    const a = await hashPassword('runtime-generated-password'); const b = await hashPassword('runtime-generated-password');
    expect(a).not.toBe(b); expect(await verifyPassword('runtime-generated-password', a)).toBe(true);
    expect(await verifyPassword('wrong-password', a)).toBe(false);
  });
  it('seed格式使用原始16字节盐而非hex文本，独立scryptSync派生可登录', async () => {
    const password=randomBytes(24).toString('base64url');const hex='00112233445566778899aabbccddeeff';
    const derived=scryptSync(password,Buffer.from(hex,'hex'),64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
    expect(await verifyPassword(password,`scrypt$16384$8$1$${hex}$${derived.toString('hex')}`)).toBe(true);
    const encoded=await hashPassword(password);const parts=encoded.split('$');
    const independent=scryptSync(password,Buffer.from(parts[4]!,'hex'),64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
    expect(parts[5]).toBe(independent.toString('hex'));
  });
});
