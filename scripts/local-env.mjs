import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';

const root = new URL('../', import.meta.url);
await mkdir(new URL('.local/', root), { recursive: true, mode: 0o700 });
const passwordPath = new URL('.local/postgres-password', root);
let password;
try { password = await readFile(passwordPath, 'utf8'); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  password = randomBytes(32).toString('hex');
  await writeFile(passwordPath, password, { flag: 'wx', mode: 0o600 });
}
await chmod(passwordPath, 0o600);
const path = new URL('.env', root);
let text = '';
try { text = await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const existing = parseEnv(text);
const defaults = parseEnv(await readFile(new URL('.env.example', root), 'utf8'));
for (const [key, template] of Object.entries(defaults)) {
  if (Object.hasOwn(existing, key)) continue;
  const value = template.includes('replace-with-a-random-local-password')
    ? template.replaceAll('replace-with-a-random-local-password', password.trim())
    : template.startsWith('replace-with-') ? randomBytes(32).toString('hex') : template;
  text += `\n${key}=${value}\n`;
}
await writeFile(path, text, { mode: 0o600 });
await chmod(path, 0o600);
console.log('Prepared private .env (600); existing values were preserved, no credentials printed.');
