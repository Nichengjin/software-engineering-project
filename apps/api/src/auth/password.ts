import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';

function scrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => derive(password, Buffer.from(salt, 'hex'), 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result)));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$16384$8$1$${salt}$${(await scrypt(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$16384$8$1' || !/^[a-f0-9]{32}$/.test(parts[4]!) || !/^[a-f0-9]{128}$/.test(parts[5]!)) return false;
  return timingSafeEqual(await scrypt(password, parts[4]!), Buffer.from(parts[5]!, 'hex'));
}
export const randomToken = () => randomBytes(32).toString('hex');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
