export type Meeting = {
  dayOfWeek: number; startMinute: number; endMinute: number;
  fromDate: string; throughDate: string;
};
export type Choices = { primaryOfferingIds: string[]; alternateOfferingIds: string[] };
export type Issue = { code: string; message: string; field?: string; offeringId?: string; studentId?: string; row?: number };
export const emptyChoices = (): Choices => ({ primaryOfferingIds: [], alternateOfferingIds: [] });
export const passing = new Set(['A', 'B', 'C', 'D']);
export const grades = new Set(['A', 'B', 'C', 'D', 'F', 'I']);

// A matching weekday must actually occur within the shared calendar interval.
export function overlaps(a: Meeting[], b: Meeting[]): boolean {
  return a.some(x => b.some(y => {
    if (x.dayOfWeek !== y.dayOfWeek || x.startMinute >= y.endMinute || y.startMinute >= x.endMinute) return false;
    const from = Math.max(Date.parse(x.fromDate), Date.parse(y.fromDate));
    const through = Math.min(Date.parse(x.throughDate), Date.parse(y.throughDate));
    if (from > through) return false;
    const weekday = new Date(from).getUTCDay() || 7;
    return from + ((x.dayOfWeek - weekday + 7) % 7) * 86400000 <= through;
  }));
}

export function choiceIssues(choices: Choices, firstSubmission?: boolean): Issue[] {
  const { primaryOfferingIds: p, alternateOfferingIds: a } = choices;
  const issues: Issue[] = [];
  if (p.length > 4 || a.length > 2 || (firstSubmission === true && (p.length !== 4 || a.length !== 2)) || (firstSubmission === false && p.length < 1)) {
    issues.push({ code: 'CHOICE_COUNT', message: firstSubmission ? '首次提交须刚好 4 个主选和 2 个备选' : '主选最多 4 个，备选最多 2 个；退掉全部课程请删除课表' });
  }
  if (new Set([...p, ...a]).size !== p.length + a.length) issues.push({ code: 'DUPLICATE_OFFERING', message: '同一班次不能重复或同时作为主选和备选' });
  return issues;
}

export type Windows = {
  teachingStartsAt: Date; initialStartsAt: Date; initialEndsAt: Date;
  addDropStartsAt: Date; addDropEndsAt: Date; closeState: string;
};
export function phase(term: Windows, now: Date): string {
  if (term.closeState !== 'OPEN') return term.closeState;
  if (now < term.teachingStartsAt) return 'BEFORE_TEACHING';
  if (now < term.initialStartsAt) return 'TEACHING';
  if (now < term.initialEndsAt) return 'INITIAL';
  if (now < term.addDropStartsAt) return 'GAP';
  if (now < term.addDropEndsAt) return 'ADD_DROP';
  return 'AWAITING_CLOSE';
}
export function studentWindow(term: Windows, now: Date): boolean {
  return (now >= term.initialStartsAt && now < term.initialEndsAt) || (now >= term.addDropStartsAt && now < term.addDropEndsAt);
}
export function validWindows(t: Windows): boolean {
  return t.teachingStartsAt <= t.initialStartsAt && t.initialStartsAt < t.initialEndsAt && t.initialEndsAt <= t.addDropStartsAt && t.addDropStartsAt < t.addDropEndsAt;
}

export function decimalHundredths(value: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Invalid decimal');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function formatHundredths(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}
export function tuition(credits: string[], price: string): { totalCredits: string; amountYuan: string } {
  const total = credits.reduce((sum, credit) => sum + decimalHundredths(credit), 0n);
  // Round half-up to a fen only once, after summing all credits.
  return { totalCredits: formatHundredths(total), amountYuan: formatHundredths((total * decimalHundredths(price) + 50n) / 100n) };
}
