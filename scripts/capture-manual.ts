// US-030 manual screenshots: viewport captures on a disposable fixture database,
// served from apps/web/dist. Assertions guard the states described by the captions.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import ExcelJS from 'exceljs';
import { startRuntime } from '../apps/api/src/runtime/start.js';
import { createFixture } from '../tests/acceptance/fixture.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(root, 'tmp/manual-screenshots');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const env = { ...process.env, AGENT_BROWSER_SESSION: `manual-shots-${process.pid}`, AGENT_BROWSER_EXECUTABLE_PATH: chrome };
const run = promisify(execFile);
const facts: Record<string, unknown> = {};

async function browser(...args: string[]) { return (await run('agent-browser', args, { cwd: root, env, encoding: 'utf8' })).stdout.trim(); }
async function evaluate(expression: string) { return JSON.parse(await browser('eval', expression, '--json')).data.result as unknown; }
async function body() { return String(await evaluate('document.body.innerText')); }
async function waitFor(predicate: () => Promise<boolean>, timeout = 8000) {
  const start = performance.now();
  while (performance.now() - start < timeout) { if (await predicate()) return; await new Promise(r => setTimeout(r, 100)); }
  throw new Error('timeout');
}
async function waitText(text: string, timeout = 8000) {
  try { await waitFor(async () => (await body()).includes(text), timeout); } catch { throw new Error(`Missing page text: ${text}`); }
}
async function click(text: string) {
  const ok = await evaluate(`(() => { const scope=document.querySelector('dialog[open]')||document; const b=[...scope.querySelectorAll('button,a')]; const e=b.find(x=>x.textContent?.trim()===${JSON.stringify(text)})||b.find(x=>x.textContent?.trim().includes(${JSON.stringify(text)})); if(!e||e.disabled)return false;e.scrollIntoView({block:'center'});e.click();return true })()`);
  assert.equal(ok, true, `missing control: ${text}`); await browser('wait', '120');
}
async function choose(offeringId: string, kind: '主选' | '备选') {
  const ok = await evaluate(`(() => { const row=[...document.querySelectorAll('tr')].find(x=>[...x.querySelectorAll('small')].some(e=>e.textContent?.trim().endsWith(${JSON.stringify(` · ${offeringId}`)}))); const b=row&&[...row.querySelectorAll('button')].find(x=>x.textContent?.trim()===${JSON.stringify(kind)}); if(!b||b.disabled)return false;b.click();return true })()`);
  assert.equal(ok, true, `${offeringId} ${kind} unavailable`);
  await waitFor(async () => Boolean(await evaluate(`[...document.querySelectorAll('.choices small')].some(e=>e.textContent===${JSON.stringify(offeringId)})`)));
}
async function login(origin: string, account: string, password: string) {
  await browser('open', origin); await waitText('欢迎登录');
  await browser('find', 'label', '账号', 'fill', account); await browser('find', 'label', '密码', 'fill', password);
  await browser('find', 'role', 'button', 'click', '--name', '登录', '--exact'); await browser('wait', '800');
}
async function logout() { await browser('cookies', 'clear'); }
// Scroll so `selector` sits `offset` px below the viewport top (0 = page top),
// drop focus rings and hover state, then capture the viewport only.
async function shot(name: string, selector?: string, offset = 24) {
  await evaluate(`(() => { document.activeElement?.blur?.(); ${selector ? `const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return false; window.scrollTo(0, Math.max(0, e.getBoundingClientRect().top + window.scrollY - ${offset}));` : 'window.scrollTo(0,0);'} return true })()`);
  await browser('mouse', 'move', '1430', '890').catch(() => undefined);
  await browser('wait', '400');
  await browser('screenshot', resolve(out, `${name}.png`));
}
const xpathText = (tag: string, text: string) => `${tag}[data-shot="${text}"]`;
async function mark(tag: string, text: string) {
  const ok = await evaluate(`(() => { const e=[...document.querySelectorAll(${JSON.stringify(tag)})].find(x=>x.textContent?.trim().startsWith(${JSON.stringify(text)})); if(!e) return false; e.setAttribute('data-shot', ${JSON.stringify(text)}); return true })()`);
  assert.equal(ok, true, `missing ${tag}: ${text}`); return xpathText(tag, text);
}

await mkdir(out, { recursive: true });
const fixture = await createFixture(12);
let server: ReturnType<typeof serve> | undefined; let stop: (() => Promise<void>) | undefined;
try {
  // Previous completed term T1 with one offering H1 for the professor grade page.
  const history = { ...fixture.snapshot, termId: fixture.ids.T1, offerings: [{ ...fixture.snapshot.offerings[0]!, id: 'H1', termId: fixture.ids.T1 }] };
  await fixture.control('catalog', { termId: history.termId, courses: history.courses, offerings: history.offerings });
  await fixture.application.catalog.fresh(fixture.ids.T1);
  await fixture.db.offering.update({ where: { externalOfferingId: 'H1' }, data: { professorId: fixture.professors[0]!.id } });
  await fixture.db.registration.createMany({ data: fixture.students.slice(0, 3).map(s => ({ studentId: s.id, offeringId: 'H1', source: 'SUBMIT' as const, state: 'COMMITTED' as const })) });
  await fixture.application.teaching.saveGrades(fixture.actor(fixture.professors[0]!.accountId), 'H1', [{ studentId: fixture.students[1]!.id, grade: 'C' }]);
  await fixture.sync();
  await fixture.db.offering.updateMany({ where: { termId: fixture.ids.T2 }, data: { professorId: fixture.professors[0]!.id } });
  // Preconditions so the shown classes survive close (>=3 students): two other
  // students hold M1-M4, three hold B1. S101 itself goes through the browser.
  for (const offeringId of ['M1', 'M2', 'M3', 'M4']) await fixture.db.registration.createMany({ data: [1, 2].map(i => ({ studentId: fixture.students[i]!.id, offeringId, source: 'SUBMIT' as const })) });
  await fixture.db.registration.createMany({ data: [3, 4, 5].map(i => ({ studentId: fixture.students[i]!.id, offeringId: 'B1', source: 'SUBMIT' as const })) });

  stop = await startRuntime(fixture.application, fixture.url, () => { process.exitCode = 1; });
  fixture.application.app.use('*', serveStatic({ root: resolve(root, 'apps/web/dist') }));
  fixture.application.app.get('*', serveStatic({ path: resolve(root, 'apps/web/dist/index.html') }));
  server = serve({ fetch: fixture.application.app.fetch, port: 0, hostname: '127.0.0.1' });
  if (!server.listening) await new Promise<void>(r => server!.once('listening', r));
  const address = server.address(); assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`; fixture.config.publicOrigin = origin;

  await browser('open', 'about:blank'); await browser('set', 'viewport', '1440', '900', '2');
  const S101 = fixture.students[0]!;
  const active = async () => (await fixture.db.registration.findMany({ where: { studentId: S101.id, offering: { termId: fixture.ids.T2 }, state: { in: ['ENROLLED', 'COMMITTED'] } }, select: { offeringId: true } })).map(r => r.offeringId).sort();

  // Student: 4+2 arranged, before saving.
  await login(origin, 'S101', fixture.password); await waitText('学生工作台');
  for (const id of ['M1', 'M2', 'M3', 'M4']) await choose(id, '主选');
  for (const id of ['B1', 'B2']) await choose(id, '备选');
  await shot('student-arranged');
  // Saved: no registration.
  await click('保存选择'); await waitText('选择已保存，不预留名额'); await waitText('尚无有效注册');
  facts.afterSave = await active(); assert.deepEqual(facts.afterSave, []);
  await shot('saved-top');
  await shot('saved-registrations', await mark('h2', '有效注册'), 120);
  // Submitted.
  await click('正式提交'); await click('确认'); await waitText('正式提交成功');
  facts.afterSubmit = await active(); assert.deepEqual(facts.afterSubmit, ['M1', 'M2', 'M3', 'M4']);
  facts.rosterM1 = await fixture.members('M1');
  await shot('submitted-top');
  await shot('submitted-registrations', await mark('h2', '有效注册'), 120);
  // Conflict: replace M4 with X2 (overlaps M2), submit rejected, registrations kept.
  const before = await fixture.application.schedules.view(S101.id, fixture.ids.T2);
  await browser('scrollintoview', 'button[aria-label="移除art"]'); await browser('click', 'button[aria-label="移除art"]');
  await waitFor(async () => !await evaluate(`[...document.querySelectorAll('.choices small')].some(e=>e.textContent==='M4')`));
  await choose('X2', '主选'); await click('正式提交'); await click('确认'); await waitText('时间冲突');
  assert.deepEqual(await fixture.application.schedules.view(S101.id, fixture.ids.T2), before);
  facts.afterConflict = await active();
  await click('取消'); await waitFor(async () => !await evaluate(`Boolean(document.querySelector('dialog[open]'))`));
  await waitText('时间冲突');
  await shot('conflict-top');
  await shot('conflict-registrations', await mark('h2', '有效注册'), 120);
  await logout();

  // Professor: previous-term grades, one invalid cell.
  await login(origin, 'P11', fixture.password); await click('成绩录入'); await browser('wait', '500');
  await browser('select', 'select', 'H1'); await browser('wait', '500');
  await browser('fill', 'input[aria-label^="S101 "]', 'D'); await browser('fill', 'input[aria-label^="S205 "]', 'Z'); await browser('fill', 'input[aria-label^="S310 "]', 'I');
  await click('提交成绩'); await click('确认'); await waitText('已提交，请查看每名学生右侧的保存结果');
  facts.grades = (await fixture.db.gradeRecord.findMany({ where: { offeringId: 'H1' }, include: { student: true }, orderBy: { student: { studentNumber: 'asc' } } })).map(r => [r.student.studentNumber, r.value]);
  assert.deepEqual(facts.grades, [['S101', 'D'], ['S205', 'C'], ['S310', 'I']]);
  await shot('professor-grades');
  await logout();

  // Registrar: xlsx import with one new, one duplicate, one invalid row.
  await login(origin, 'R01', fixture.password); await click('批量导入'); await waitText('逐行独立处理');
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('students');
  sheet.addRow(['name', 'birthDate', 'ssn', 'status']);
  sheet.addRow(['浏览器导入', '2005-01-01', 'TEST-UI-NEW', 'ACTIVE']);
  sheet.addRow(['不得覆盖', '2005-01-01', 'TEST-S-0', 'ACTIVE']);
  sheet.addRow(['', '2005-01-01', 'TEST-UI-BAD', 'ACTIVE']);
  const xlsx = resolve(out, 'input.xlsx'); await workbook.xlsx.writeFile(xlsx);
  await browser('upload', 'input[type=file]', xlsx); await click('检查并导入'); await click('确认');
  await waitText('文件处理已完成');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.stats strong')].map(e=>e.textContent)`), ['1', '1', '1']);
  await click('已交付，隐藏全部初始密码'); await waitText('已隐藏');
  await shot('import-result', await mark('h2', '上传 xlsx'), 24);
  // Close registration and wait for every billing acknowledgment in DB and UI.
  await click('关闭、计费与补选'); await browser('find', 'role', 'button', 'click', '--name', '关闭选课', '--exact'); await click('确认');
  await waitText('关闭完成', 15000);
  await waitFor(async () => await fixture.db.billingOutbox.count({ where: { status: { not: 'ACKNOWLEDGED' } } }) === 0, 15000);
  const total = await fixture.db.billingOutbox.count();
  await waitFor(async () => await evaluate(`document.querySelector('.stats > div:nth-child(4) strong')?.textContent`) === String(total), 15000);
  facts.billing = (await fixture.db.billingOutbox.findMany({ include: { student: true }, orderBy: { student: { studentNumber: 'asc' } } })).map(b => [b.student.studentNumber, String(b.amountYuan)]);
  await shot('closed');
  facts.userAgent = await evaluate('navigator.userAgent');
  facts.shotAt = new Date().toISOString();
  await writeFile(resolve(out, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
  console.log(JSON.stringify(facts, null, 2));
} finally {
  await browser('close').catch(() => undefined);
  await new Promise<void>(r => server ? server.close(() => r()) : r());
  await stop?.();
  await fixture.dispose();
}
