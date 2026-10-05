import type { Issue } from './rules.js';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public issues: Issue[] = [], public currentVersion?: number) { super(message); }
}
export function stale(version: number): never { throw new ApiError(409, 'STALE_VERSION', '课表或资料已更新，请重新加载', [], version); }
export function requireRules(issues: Issue[]) {
  if (issues.length) throw new ApiError(422, 'RULE_VIOLATION', '检查未通过，请调整后重试', issues);
}
