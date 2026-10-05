import { createHmac } from 'node:crypto';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context, MiddlewareHandler } from 'hono';
import type { Prisma } from '@prisma/client';
import { loginSchema, changePasswordSchema, logoutSchema } from '@wylie/contracts';
import { ApiError } from '../errors.js';
import { Runtime } from '../runtime/context.js';
import { hashPassword, verifyPassword, randomToken, digest, safeEqual } from './password.js';

export type AuthAccount = Prisma.AccountGetPayload<{ include: { student: true; professor: true } }>;
export type Env = { Variables: { requestId: string; account: AuthAccount; sid: string; sessionId: string; expiresAt: Date } };
export function csrf(rt: Runtime, sid: string) { return createHmac('sha256', rt.config.csrfSigningKey).update(sid).digest('hex'); }
export function origin(rt: Runtime, c: Context<Env>) {
  if (c.req.header('Origin') !== rt.config.publicOrigin) throw new ApiError(403, 'CSRF_FAILED', '请求来源不匹配');
}
export function authView(account: AuthAccount, token: string, expiresAt: Date) {
  return { user: { id: account.id, account: account.account, name: account.student?.name ?? account.professor?.name ?? account.account, role: account.role, personId: account.studentId ?? account.professorId, mustChangePassword: account.mustChangePassword }, csrfToken: token, expiresAt: expiresAt.toISOString() };
}
export async function parseBody<S extends import('zod').ZodTypeAny>(c: Context<Env>, schema: S): Promise<import('zod').output<S>> {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { throw new ApiError(400, 'INVALID_INPUT', 'JSON 无法解析'); }
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError(400, 'INVALID_INPUT', '请求字段无效', result.error.issues.map(i => ({ field: i.path.join('.'), code: 'INVALID_INPUT', message: '字段格式无效或包含未知字段' })));
  return result.data;
}
export async function success(c: Context<Env>, rt: Runtime, data: unknown, status: 200 | 201 | 202 = 200) {
  return c.json({ data, requestId: c.get('requestId'), serverTime: (rt.deps.clock?.() ?? new Date()).toISOString() }, status);
}
export function authenticate(rt: Runtime): MiddlewareHandler<Env> {
  return async (c, next) => {
    if (c.req.path.startsWith('/api/health/') || c.req.path === '/api/auth/login') return next();
    if (!rt.ready) throw new ApiError(503, 'RECOVERING', '系统正在恢复');
    const sid = getCookie(c, 'sid'); if (!sid) throw new ApiError(401, 'UNAUTHENTICATED', '请先登录');
    const session = await rt.db.session.findUnique({ where: { tokenHash: digest(sid) }, include: { account: { include: { student: true, professor: true } } } });
    if (!session || session.expiresAt <= await rt.now()) throw new ApiError(401, 'UNAUTHENTICATED', '会话无效或已过期');
    const account = session.account;
    c.set('account', account); c.set('sid', sid); c.set('sessionId', session.id); c.set('expiresAt', session.expiresAt);
    if (!account.enabled || account.professor?.status === 'DEPARTED') throw new ApiError(403, 'ACCOUNT_DISABLED', '账户不可用');
    if (account.mustChangePassword && !['/api/auth/me','/api/auth/change-password','/api/auth/logout'].includes(c.req.path)) throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', '请先修改初始密码');
    if (account.student && account.student.status !== 'ACTIVE' && !['/api/auth/me','/api/auth/change-password','/api/auth/logout','/api/student/report-card'].includes(c.req.path)) throw new ApiError(403, 'FORBIDDEN', '当前学生状态仅允许查看成绩');
    if (!['GET','HEAD','OPTIONS'].includes(c.req.method)) {
      origin(rt, c);
      if (!safeEqual(digest(c.req.header('X-CSRF-Token') ?? ''), session.csrfHash)) throw new ApiError(403, 'CSRF_FAILED', 'CSRF 校验失败');
    }
    await next();
  };
}
export function authRoutes(app: import('hono').Hono<Env>, rt: Runtime) {
  const cookie = { httpOnly: true, sameSite: 'Lax' as const, secure: rt.config.secureCookie, path: '/', maxAge: 43200 };
  const dummy = hashPassword(randomToken());
  app.post('/api/auth/login', async c => {
    origin(rt, c); const input = await parseBody(c, loginSchema);
    const account = await rt.db.account.findUnique({ where: { account: input.account }, include: { student: true, professor: true } });
    const verified = await verifyPassword(input.password, account?.passwordHash ?? await dummy);
    if (!account || !verified || !account.enabled || account.professor?.status === 'DEPARTED') throw new ApiError(401, 'INVALID_CREDENTIALS', '账号或密码无效');
    const sid = randomToken(); const token = csrf(rt, sid); const expiresAt = new Date((await rt.now()).getTime() + 43200000);
    await rt.transaction([], async tx => {
      const current = await tx.account.findUniqueOrThrow({ where: { id: account.id }, include: { professor: true } });
      if (current.passwordHash !== account.passwordHash || !current.enabled || current.professor?.status === 'DEPARTED') throw new ApiError(401, 'INVALID_CREDENTIALS', '账号或密码无效');
      await tx.session.create({ data: { tokenHash: digest(sid), csrfHash: digest(token), accountId: account.id, expiresAt } });
      await rt.audit(tx, { accountId: account.id, requestId: c.get('requestId') }, 'auth.login', 'Account', account.id);
    });
    setCookie(c, 'sid', sid, cookie); c.header('Cache-Control', 'no-store');
    return success(c, rt, authView(account, token, expiresAt));
  });
  app.get('/api/auth/me', c => success(c, rt, authView(c.get('account'), csrf(rt, c.get('sid')), c.get('expiresAt'))));
  app.post('/api/auth/logout', async c => {
    await parseBody(c, logoutSchema); await rt.db.session.deleteMany({ where: { id: c.get('sessionId') } }); deleteCookie(c, 'sid', { path: '/' });
    return success(c, rt, { loggedOut: true });
  });
  app.post('/api/auth/change-password', async c => {
    const input = await parseBody(c, changePasswordSchema); const account = c.get('account');
    if (!await verifyPassword(input.currentPassword, account.passwordHash) || input.currentPassword === input.newPassword) throw new ApiError(422, 'RULE_VIOLATION', '当前密码错误或新密码与旧密码相同');
    const passwordHash = await hashPassword(input.newPassword); const sid = randomToken(); const token = csrf(rt, sid); const expiresAt = new Date((await rt.now()).getTime() + 43200000);
    const changed = await rt.transaction([], async tx => {
      const current = await tx.account.findUniqueOrThrow({ where: { id: account.id }, include: { professor: true } });
      if (!current.enabled || current.professor?.status === 'DEPARTED' || current.passwordHash !== account.passwordHash) throw new ApiError(403, 'ACCOUNT_DISABLED', '凭据已变更，请重新登录');
      await tx.session.deleteMany({ where: { accountId: account.id } });
      const updated = await tx.account.update({ where: { id: account.id }, data: { passwordHash, mustChangePassword: false }, include: { student: true, professor: true } });
      await tx.session.create({ data: { accountId: account.id, tokenHash: digest(sid), csrfHash: digest(token), expiresAt } });
      await rt.audit(tx, { accountId: account.id, requestId: c.get('requestId') }, 'auth.changePassword', 'Account', account.id); return updated;
    });
    setCookie(c, 'sid', sid, cookie); return success(c, rt, authView(changed, token, expiresAt));
  });
}
