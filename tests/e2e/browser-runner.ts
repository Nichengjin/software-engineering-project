import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { startRuntime } from '../../apps/api/src/runtime/start.js';
import { createFixture, choices } from '../acceptance/fixture.js';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const artifacts = resolve(root, '.amp/in/artifacts/browser-us018');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const session = `us018-${process.pid}`;
const env = { ...process.env, AGENT_BROWSER_SESSION: session, AGENT_BROWSER_EXECUTABLE_PATH: chrome };
const runFile = promisify(execFile);
type Result = { name: string; status: 'passed' | 'failed' | 'skipped'; detail?: string };
const results: Result[] = [];
const timings: Record<string, number[]> = Object.fromEntries(['AC-09', 'AC-45-time', 'AC-45-prerequisite', 'AC-46', 'AC-49', 'AC-64'].map(k => [k, []]));

async function browser(...args: string[]) {
  return (await runFile('agent-browser', args, { cwd: root, env, encoding: 'utf8' })).stdout.trim();
}
async function evaluate(expression: string) { return JSON.parse(await browser('eval', expression, '--json')).data.result as unknown; }
async function body() { return String(await evaluate('document.body.innerText')); }
async function click(text: string) {
  const ok = await evaluate(`(() => { const scope=document.querySelector('dialog[open]')||document; const buttons=[...scope.querySelectorAll('button,a')]; const e=buttons.find(x=>x.textContent?.trim()===${JSON.stringify(text)})||buttons.find(x=>x.textContent?.trim().includes(${JSON.stringify(text)})); if(!e||e.disabled)return false;e.scrollIntoView({block:'center'});e.click();return true })()`);
  assert.equal(ok, true, `missing control: ${text}`);
  await browser('wait', '80');
}
async function waitFor(predicate: () => Promise<boolean>, timeout = 5500) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (await predicate()) return performance.now() - start;
    await new Promise(resolveWait => setTimeout(resolveWait, 50));
  }
  throw new Error(`DOM did not change within ${timeout}ms`);
}
async function record(name: string, action: () => Promise<void>) {
  try { await action(); results.push({ name, status: 'passed' }); }
  catch (error) {
    results.push({ name, status: 'failed', detail: error instanceof Error ? error.message : String(error) });
    // Diagnostic UI text only: never capture credential panels or form values.
    console.log('UI failure context', await evaluate(`({alerts:[...document.querySelectorAll('.alert')].map(e=>e.textContent),buttons:[...document.querySelectorAll('button')].map(e=>({text:e.textContent,disabled:e.disabled})),headings:[...document.querySelectorAll('h1,h2')].map(e=>e.textContent)})`));
  }
  console.log(JSON.stringify(results.at(-1)));
}
async function login(origin: string, account: string, password: string) {
  await browser('open', origin);
  await browser('find', 'label', '账号', 'fill', account);
  await browser('find', 'label', '密码', 'fill', password);
  await browser('find', 'role', 'button', 'click', '--name', '登录', '--exact');
  await browser('wait', '800');
}
async function logout() {
  await click('退出登录'); await click('确认'); await waitFor(async () => Boolean(await evaluate(`!!document.querySelector('input[autocomplete="username"]')`)));
}
async function resetLogin(origin: string) { await browser('cookies', 'clear'); await browser('open', origin); await waitText('欢迎登录'); }
async function choose(offeringId: string, kind: '主选' | '备选') {
  const ok = await evaluate(`(() => { const row=[...document.querySelectorAll('tr')].find(x=>[...x.querySelectorAll('small')].some(e=>e.textContent?.trim().endsWith(${JSON.stringify(` · ${offeringId}`)}))); const b=row&&[...row.querySelectorAll('button')].find(x=>x.textContent?.trim()===${JSON.stringify(kind)}); if(!b||b.disabled)return false;b.click();return true })()`);
  assert.equal(ok, true, `${offeringId} ${kind} unavailable`);
  await waitFor(async () => Boolean(await evaluate(`[...document.querySelectorAll('.choices small')].some(e=>e.textContent===${JSON.stringify(offeringId)})`)));
}
async function rowClick(unique: string, text: string) {
  const ok = await evaluate(`(() => { const row=[...document.querySelectorAll('tr')].find(x=>x.textContent?.includes(${JSON.stringify(unique)})); const e=row&&[...row.querySelectorAll('button')].find(x=>x.textContent?.trim()===${JSON.stringify(text)}); if(!e||e.disabled)return false;e.scrollIntoView({block:'center'});e.click();return true })()`);
  assert.equal(ok, true, `${unique}: missing enabled ${text}`);
}
async function waitText(text: string, timeout = 5500) {
  try { return await waitFor(async () => (await body()).includes(text), timeout); }
  catch { throw new Error(`Missing page text: ${text}`); }
}
async function field(label: string, value: string) {
  // agent-browser 0.33.2 fill leaves native date controls empty. Use the native
  // DOM setter and real bubbling input events, not React internals or API writes.
  const date = await evaluate(`(() => { const e=[...document.querySelectorAll('label')].find(e=>e.textContent?.trim()===${JSON.stringify(label)})?.querySelector('input'); if(!e||!['date','datetime-local'].includes(e.type))return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true; })()`);
  if (!date) await browser('find', 'label', label, 'fill', value);
}
async function selectField(label: string, value: string) {
  const found = await evaluate(`(() => { const e=[...document.querySelectorAll('label')].find(e=>e.textContent?.trim().startsWith(${JSON.stringify(label)}))?.querySelector('select'); if(!e)return false;e.dataset.testSelect='target';return true; })()`);
  assert.equal(found, true, `Missing select: ${label}`);
  try { await browser('select', 'select[data-test-select="target"]', value); }
  finally { await evaluate(`document.querySelector('[data-test-select="target"]')?.removeAttribute('data-test-select')`); }
}

await mkdir(artifacts, { recursive: true });
const fixture = await createFixture();
let server: ReturnType<typeof serve> | undefined;
let stop: (() => Promise<void>) | undefined;
try {
  // Initial state only. Every timed transition below uses business HTTP requests
  // or the external catalogue control API, never direct database writes.
  const history = { ...fixture.snapshot, termId: fixture.ids.T1, offerings: [{ ...fixture.snapshot.offerings[0]!, id: 'H1', termId: fixture.ids.T1 }] };
  await fixture.control('catalog', { termId: history.termId, courses: history.courses, offerings: history.offerings });
  await fixture.application.catalog.fresh(fixture.ids.T1);
  await fixture.db.offering.update({ where: { externalOfferingId: 'H1' }, data: { professorId: fixture.professors[0]!.id } });
  await fixture.db.registration.createMany({ data: fixture.students.slice(0, 3).map(s => ({ studentId: s.id, offeringId: 'H1', source: 'SUBMIT' as const, state: 'COMMITTED' as const })) });
  await fixture.application.teaching.saveGrades(fixture.actor(fixture.professors[0]!.accountId), 'H1', [{ studentId: fixture.students[1]!.id, grade: 'C' }]);
  await fixture.application.teaching.saveGrades(fixture.actor(fixture.professors[0]!.accountId), 'H1', [
    { studentId: fixture.students[0]!.id, grade: 'D' },
    { studentId: fixture.students[2]!.id, grade: 'I' },
  ]);
  fixture.snapshot.offerings.push({ ...fixture.snapshot.offerings.find(o => o.id === 'X2')!, id: 'TC', meetings: structuredClone(fixture.snapshot.offerings.find(o => o.id === 'M1b')!.meetings) });
  fixture.snapshot.offerings.push(...Array.from({ length: 10 }, (_, i) => ({ ...fixture.snapshot.offerings[3]!, id: `D${i}` })));
  await fixture.sync();
  await fixture.db.offering.updateMany({ where: { termId: fixture.ids.T2 }, data: { professorId: fixture.professors[0]!.id } });
  await fixture.db.offering.update({ where: { externalOfferingId: 'M1b' }, data: { professorId: null } });
  await fixture.db.offering.update({ where: { externalOfferingId: 'TC' }, data: { professorId: null } });
  await fixture.db.qualification.deleteMany({ where: { professorId: fixture.professors[2]!.id } });
  await fixture.db.registration.createMany({ data: fixture.students.slice(10, 19).map(s => ({ studentId: s.id, offeringId: 'E1', source: 'SUBMIT' as const })) });
  await fixture.register(1, ['M1']);
  stop = await startRuntime(fixture.application, fixture.url, () => { process.exitCode = 1; });
  fixture.application.app.use('*', serveStatic({ root: resolve(root, 'apps/web/dist') }));
  fixture.application.app.get('*', serveStatic({ path: resolve(root, 'apps/web/dist/index.html') }));
  server = serve({ fetch: fixture.application.app.fetch, port: 0, hostname: '127.0.0.1' });
  if (!server.listening) await new Promise<void>(resolveListening => server!.once('listening', resolveListening));
  const address = server.address(); assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  fixture.config.publicOrigin = origin;
  const auth = await fixture.login('S101'); const other = await fixture.login('S205');
  async function remote(selected: ReturnType<typeof choices>, mode: 'SAVE' | 'SUBMIT', identity = auth, stale?: number) {
    const base = `/api/student/terms/${fixture.ids.T2}/schedule`;
    const headers = { Cookie: identity.cookie, Origin: origin, 'X-CSRF-Token': identity.csrf, 'Content-Type': 'application/json' };
    const current = await (await fetch(`${origin}${base}`, { headers })).json();
    const version = stale ?? current.data.schedule.version;
    const response = await fetch(`${origin}${base}${mode === 'SUBMIT' ? '/submit' : ''}`, { method: mode === 'SUBMIT' ? 'POST' : 'PUT', headers, body: JSON.stringify({ ...selected, expectedVersion: version }) });
    const data = await response.json();
    assert.equal(response.status, stale === undefined ? 200 : 409, JSON.stringify(data));
    return version;
  }
  async function registered(id: string) {
    return Boolean(await evaluate(`(() => { const p=[...document.querySelectorAll('section')].find(p=>p.querySelector('h2')?.textContent==='有效注册（不是已保存选择）'); return p&&[...p.querySelectorAll('small')].some(e=>e.textContent===${JSON.stringify(id)}); })()`));
  }
  async function adopt() { await click('采用服务器版本并重新编辑'); await click('确认'); await waitFor(async () => !(await body()).includes('服务器课表已变更')); }
  async function dirty() { await browser('click', 'button[aria-label="移除math"]'); }

  await record('AC-02 wrong login stays unauthenticated', async () => {
    await browser('open', origin); await browser('find', 'label', '账号', 'fill', 'S101'); await browser('find', 'label', '密码', 'fill', 'definitely-wrong'); await click('登录'); await browser('wait', '300');
    assert.match(await body(), /账号或密码/); assert.match(await body(), /欢迎登录/);
  });
  await record('AC-01 student login and role landing', async () => { await login(origin, 'S101', fixture.password); assert.match(await body(), /学生工作台/); });
  await record('AC-05 save does not register', async () => {
    for (const id of ['M1', 'M2', 'M3', 'M4']) await choose(id, '主选');
    for (const id of ['B1', 'B2']) await choose(id, '备选');
    await click('保存选择'); await browser('wait', '500'); assert.match(await body(), /选择已保存，不预留名额/); assert.match(await body(), /尚无有效注册/);
  });
  await record('AC-06 4+2 submit registers four primaries', async () => { await click('正式提交'); await click('确认'); await browser('wait', '700'); assert.match(await body(), /正式提交成功/); for (const id of ['M1','M2','M3','M4']) assert.match(await body(), new RegExp(id)); });
  await record('AC-07 invalid conflict rolls back', async () => {
    const before = await fixture.application.schedules.view(fixture.students[0]!.id, fixture.ids.T2);
    // agent-browser's raw click does not automatically scroll offscreen targets.
    await browser('scrollintoview', 'button[aria-label="移除art"]');
    await browser('click', 'button[aria-label="移除art"]');
    await waitFor(async () => !await evaluate(`[...document.querySelectorAll('.choices small')].some(e=>e.textContent==='M4')`));
    await choose('X2', '主选');
    await click('正式提交'); await click('确认');
    await waitFor(async () => (await body()).includes('时间冲突'));
    assert.deepEqual(await fixture.application.schedules.view(fixture.students[0]!.id, fixture.ids.T2), before);
    await browser('screenshot', resolve(artifacts, 'conflict.png'));
    await click('取消'); await browser('scrollintoview', 'button[aria-label="移除extra"]');
    await browser('click', 'button[aria-label="移除extra"]'); await choose('M4', '主选');
  });
  await record('BUG-001 catalog actions stay visible in a 1280px workspace', async () => {
    // A common lab projector width: the catalog table scrolls inside its panel,
    // so every row's action buttons must stay within the visible table area.
    await browser('set', 'viewport', '1280', '800'); await browser('wait', '300');
    const clipped = await evaluate(`(() => { const wrap=document.querySelector('.selection-layout .table-wrap'); if(!wrap)return ['missing table']; wrap.scrollLeft=0; const box=wrap.getBoundingClientRect(); return [...wrap.querySelectorAll('tbody tr')].flatMap(row=>[...row.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.right>box.right+0.5||r.left<box.left-0.5}).map(b=>(row.querySelector('small')?.textContent??'')+' '+b.textContent)); })()`);
    assert.deepEqual(clipped, []);
    assert.doesNotMatch(await body(), /≠/);
  });
  await record('AC-11 delete cancel keeps registrations', async () => { await click('删除整个课表'); await click('取消'); assert.match(await body(), /有效注册/); });
  await browser('screenshot', resolve(artifacts, 'student.png'));
  await logout();

  await record('AC-22 transcript shows D and I only to their students', async () => {
    await login(origin, 'S101', fixture.password); await click('成绩单'); await waitText('我的成绩单'); assert.match(await body(), /H1[\s\S]*D/); await logout();
    await login(origin, 'S310', fixture.password); await click('成绩单'); await waitText('我的成绩单'); assert.match(await body(), /H1[\s\S]*I/); await logout();
  });
  await record('AC-23 transcript empty result is explicit', async () => {
    await login(origin, 'S420', fixture.password); await click('成绩单'); await waitText('该学期暂无成绩记录'); assert.doesNotMatch(await body(), /H1[\s\S]*(D|I)/); await logout();
  });

  await record('AC-17 professor roster contains only registered students', async () => { await login(origin, 'P11', fixture.password); await click('学生名册'); await browser('wait', '500'); await browser('select', 'select', 'M1'); await browser('wait', '400'); assert.match(await body(), /S101/); });
  await record('AC-19 grade page exposes previous completed term only', async () => { await click('成绩录入'); await browser('wait', '400'); assert.match(await body(), /上一完成学期/); });
  await record('AC-19/20 mixed grade cells persist independently in browser', async () => {
    await browser('select', 'select', 'H1'); await browser('wait', '400');
    await browser('fill', 'input[aria-label^="S101 "]', 'D'); await browser('fill', 'input[aria-label^="S205 "]', 'Z');
    await browser('fill', 'input[aria-label^="S310 "]', 'I'); await click('提交成绩'); await click('确认');
    await waitFor(async () => (await body()).includes('已提交，请查看每名学生右侧的保存结果'));
    const rows = await fixture.db.gradeRecord.findMany({ where: { offeringId: 'H1' }, include: { student: true }, orderBy: { student: { studentNumber: 'asc' } } });
    assert.deepEqual(rows.map(r => [r.student.studentNumber, r.value]), [['S101', 'D'], ['S205', 'C'], ['S310', 'I']]);
    // The rejected cell shows its own failure reason beside the saved cells.
    assert.match(await body(), /失败/); assert.match(await body(), /成绩只能为/);
  });
  await browser('screenshot', resolve(artifacts, 'professor.png')); await logout();

  await record('AC-21 professor with no previous-term offerings sees an empty result', async () => {
    await login(origin, 'P27', fixture.password); await click('成绩录入'); await waitText('没有符合上一完成学期及上线学期范围的本人班次'); await logout();
  });
  await record('AC-14/15 professor replaces teaching; conflict is rejected and cancel preserves edit', async () => {
    await login(origin, 'P27', fixture.password);
    try {
      await click('授课选择'); await rowClick('M1b', '选择授课'); await click('保存授课安排'); await click('确认'); await waitFor(async () => (await fixture.application.teaching.view(fixture.professors[1]!.id, fixture.ids.T2)).offeringIds.includes('M1b'));
      await rowClick('TC', '选择授课'); await click('保存授课安排'); await click('确认'); await waitFor(async () => /冲突|重叠/.test(await body()), 10000);
      assert.deepEqual((await fixture.application.teaching.view(fixture.professors[1]!.id, fixture.ids.T2)).offeringIds, ['M1b']); await click('取消'); assert.match(await body(), /本地授课安排/);
    } finally {
      await resetLogin(origin);
    }
  });
  await record('AC-16 qualification-empty and catalogue-failure professor feedback', async () => {
    await login(origin, 'P39', fixture.password); await click('授课选择'); await waitText('无授课资格');
    assert.equal(await evaluate(`[...document.querySelectorAll('button')].filter(e=>e.textContent?.trim()==='选择授课').every(e=>e.disabled)`), true);
    await fixture.control('faults', { catalog: { mode: 'unavailable', delayMs: 0 }, billing: { mode: 'normal', delayMs: 0 } });
    await waitText('课程目录不可用', 7000);
    await fixture.control('faults', { catalog: { mode: 'normal', delayMs: 0 }, billing: { mode: 'normal', delayMs: 0 } }); await logout();
  });

  await record('AC-59 registrar import UI requires xlsx and confirmation', async () => { await login(origin, 'R01', fixture.password); await click('批量导入'); assert.match(await body(), /逐行独立处理/); assert.equal(await evaluate(`document.querySelector('button.primary')?.hasAttribute('disabled')`), true); });
  await record('AC-59 real xlsx upload through file picker', async () => {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('students');
    sheet.addRow(['name', 'birthDate', 'ssn', 'status']);
    sheet.addRow(['浏览器导入', '2005-01-01', 'TEST-UI-NEW', 'ACTIVE']);
    sheet.addRow(['不得覆盖', '2005-01-01', 'TEST-S-0', 'ACTIVE']);
    sheet.addRow(['', '2005-01-01', 'TEST-UI-BAD', 'ACTIVE']);
    const path = resolve(artifacts, 'input.xlsx'); await workbook.xlsx.writeFile(path);
    await browser('upload', 'input[type=file]', path); await click('检查并导入'); await click('确认');
    await waitFor(async () => (await body()).includes('文件处理已完成'));
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.stats strong')].map(e=>e.textContent)`), ['1', '1', '1']);
    await click('已交付，隐藏全部初始密码');
    assert.match(await body(), /已隐藏/); await browser('screenshot', resolve(artifacts, 'import.png'), '--full');
  });
  await record('AC-24/26 registrar creates and edits a student and professor', async () => {
    await click('学生管理'); await click('新增学生'); await field('姓名', '浏览器新学生'); await field('出生日期', '2004-03-04'); await field('SSN（按文本保留前导零）', 'E2E-STUDENT-CREATE'); await click('确认新增'); await click('确认'); await waitText('一次性初始凭据'); await click('已安全交付');
    await field('按编号或姓名搜索', '浏览器新学生'); await click('搜索'); await waitText('浏览器新学生'); await rowClick('浏览器新学生', '编辑'); await waitText('编辑 浏览器新学生'); await field('姓名', '浏览器学生已修改'); await click('预览并确认修改'); await click('确认'); await waitFor(async () => await fixture.db.student.count({ where: { name: '浏览器学生已修改' } }) === 1); await field('按编号或姓名搜索', '浏览器学生已修改'); await click('搜索'); await waitText('浏览器学生已修改');
    await click('教授管理'); await click('新增教授'); await field('姓名', '浏览器新教授'); await field('出生日期', '1984-05-06'); await field('SSN（按文本保留前导零）', 'E2E-PROF-CREATE'); await field('院系', '浏览器学院'); await click('确认新增'); await click('确认'); await waitText('一次性初始凭据'); await click('已安全交付');
    await field('按编号或姓名搜索', '浏览器新教授'); await click('搜索'); await waitText('浏览器新教授'); await rowClick('浏览器新教授', '编辑'); await field('院系', '修改后学院'); await click('预览并确认修改'); await click('确认'); await waitFor(async () => await fixture.db.professor.count({ where: { name: '浏览器新教授', department: '修改后学院' } }) === 1); await field('按编号或姓名搜索', '浏览器新教授'); await click('搜索'); await waitText('修改后学院');
  });
  await record('AC-25/27 registrar delete cancel preserves and confirm removes clean people', async () => {
    await rowClick('浏览器新教授', '删除'); await click('取消'); assert.match(await body(), /浏览器新教授/); await rowClick('浏览器新教授', '删除'); await click('确认'); await waitText('人员已删除');
    await click('学生管理'); await field('按编号或姓名搜索', '浏览器学生已修改'); await click('搜索'); await waitText('浏览器学生已修改'); await rowClick('浏览器学生已修改', '删除'); await click('取消'); assert.match(await body(), /浏览器学生已修改/); await rowClick('浏览器学生已修改', '删除'); await click('确认'); await waitText('人员已删除');
  });
  await record('AC-56 legal window save and illegal-order feedback', async () => {
    await click('学期窗口'); await field('加退选结束（北京时间）', '2026-10-05T18:02'); await click('保存窗口'); await click('确认'); await waitText('学期窗口已保存');
    await field('初选结束（北京时间）', '2026-09-24T18:00'); await click('保存窗口'); await click('确认'); await waitText('学期各阶段时间顺序无效', 7000); await click('取消');
  });
  await record('AC-28/35 close UI warns about final result and billing delivery', async () => { await click('关闭、计费与补选'); assert.match(await body(), /处理完成后，下方显示最终结果和账单发送情况/); assert.match(await body(), /计费送达状态/); });
  await browser('screenshot', resolve(artifacts, 'registrar.png')); await logout();

  // A real browser observes a separate authenticated HTTP client's writes.
  // This measures server/event-to-DOM latency, not a two-browser usability test.
  await login(origin, 'S101', fixture.password);
  await record('NFR-10 six real event paths, ten observations each, every sample <=5s', async () => {
    const publish = () => fixture.control('catalog', { termId: fixture.ids.T2, courses: fixture.snapshot.courses, offerings: fixture.snapshot.offerings });
    const notice = async (text: string) => Boolean(await evaluate(`[...document.querySelectorAll('.notice-list li')].some(e=>e.textContent.includes(${JSON.stringify(text)})&&!e.textContent.includes('已解决'))`));
    const meetings = structuredClone(fixture.snapshot.offerings[0]!.meetings);
    for (let i = 0; i < 10; i++) {
      await remote(choices(['M1', 'M2', 'M3', 'M4'], []), 'SUBMIT'); await waitFor(() => registered('M4'));
      await remote(choices(['E1'], []), 'SUBMIT', other);
      timings['AC-09']!.push(await waitFor(async () => (await body()).includes('10/10')));
      await remote(choices(['M1'], []), 'SUBMIT', other); await waitFor(async () => (await body()).includes('9/10'));
      fixture.snapshot.offerings[0]!.meetings = fixture.snapshot.offerings[1]!.meetings; await publish();
      timings['AC-45-time']!.push(await waitFor(() => notice('时间冲突')));
      fixture.snapshot.offerings[0]!.meetings = meetings; await publish(); await waitFor(async () => !await notice('时间冲突'));
      fixture.snapshot.courses[0]!.prerequisiteCourseIds = ['advanced']; await publish();
      timings['AC-45-prerequisite']!.push(await waitFor(() => notice('先修')));
      fixture.snapshot.courses[0]!.prerequisiteCourseIds = []; await publish(); await waitFor(async () => !await notice('先修'));
      const deleted = `D${i}`;
      await remote(choices(['M1', 'M2', 'M3', deleted], []), 'SUBMIT'); await waitFor(() => registered(deleted));
      fixture.snapshot.offerings = fixture.snapshot.offerings.filter(o => o.id !== deleted); await publish();
      timings['AC-46']!.push(await waitFor(async () => !await registered(deleted) && await notice(deleted)));
      for (const ac of ['AC-49', 'AC-64']) {
        // Ensure the page has adopted the previous clean version before editing.
        await browser('wait', '1100'); await dirty();
        const mode = ac === 'AC-49' ? 'SUBMIT' : 'SAVE';
        const old = await remote(choices(['M1', 'M2', 'M3', i % 2 ? 'M4' : 'E1'], []), mode);
        timings[ac]!.push(await waitFor(async () => (await body()).includes('服务器课表已变更')));
        await remote(choices(['M1'], []), mode, auth, old);
        assert.equal(await evaluate(`document.querySelector('button.primary')?.disabled`), true);
        if (i === 9 && ac === 'AC-64') await browser('screenshot', resolve(artifacts, 'stale-draft.png'));
        await adopt();
      }
      console.log(`Real event timing round ${i + 1}/10`);
    }
    for (const [ac, samples] of Object.entries(timings)) { assert.equal(samples.length, 10, ac); assert(Math.max(...samples) <= 5000, `${ac} latency >5s`); }
  });
  await browser('screenshot', resolve(artifacts, 'nfr10.png'));

  await record('AC-49/64 two real pages preserve the stale local draft', async () => {
    const tabs = JSON.parse(await browser('tab', '--json')) as { data: { tabs: { tabId: string; active: boolean }[] } };
    const originalTab = tabs.data.tabs.find(tab => tab.active)!.tabId;
    await dirty();
    await browser('tab', 'new', `${origin}/student/selection`); const afterOpen = JSON.parse(await browser('tab', '--json')) as { data: { tabs: { tabId: string; active: boolean }[] } }; const secondTab = afterOpen.data.tabs.find(tab => tab.active)!.tabId;
    try {
      await waitFor(async () => Boolean(await evaluate(`!!document.querySelector('button[aria-label="移除art"]')`)));
      await browser('scrollintoview', 'button[aria-label="移除art"]'); await browser('click', 'button[aria-label="移除art"]'); await click('保存选择'); await waitText('选择已保存');
      await browser('tab', originalTab); await waitText('服务器课表已变更');
      assert.equal(await evaluate(`document.querySelector('button.primary')?.disabled`), true);
      assert.equal(await evaluate(`[...document.querySelectorAll('.choices small')].some(e=>e.textContent==='M1')`), false, 'stale local removal must be preserved'); await adopt();
    } finally { await browser('tab', secondTab); await browser('tab', 'close'); await browser('tab', originalTab); }
  });
  await record('NFR-10 offline polling reconnects and exposes a concurrent server version', async () => {
    await dirty(); await browser('set', 'offline', 'on');
    try {
      await waitFor(async () => (await body()).includes('无法连接服务器'), 7000);
      await remote(choices(['M1', 'M3'], []), 'SAVE');
      assert.equal(await evaluate(`[...document.querySelectorAll('.choices small')].some(e=>e.textContent==='M1')`), false, 'offline dirty draft must remain');
    } finally { await browser('set', 'offline', 'off'); }
    await waitText('服务器课表已变更', 7000); await adopt();
  });
  await record('AC-09 server rejects full offering while observer notifications are blocked', async () => {
    await browser('set', 'offline', 'on');
    try {
      await remote(choices(['E1'], []), 'SUBMIT', other);
      const base = `/api/student/terms/${fixture.ids.T2}/schedule`;
      const headers = { Cookie: auth.cookie, Origin: origin, 'X-CSRF-Token': auth.csrf, 'Content-Type': 'application/json' };
      const current = await (await fetch(`${origin}${base}`, { headers })).json();
      const rejected = await fetch(`${origin}${base}/submit`, { method: 'POST', headers, body: JSON.stringify({ ...choices(['M1', 'E1'], []), expectedVersion: current.data.schedule.version }) });
      assert([409, 422].includes(rejected.status), `unexpected status ${rejected.status}`); assert.match(JSON.stringify(await rejected.json()), /CAPACITY|容量|满/);
    } finally { await browser('set', 'offline', 'off'); }
    await waitFor(async () => (await body()).includes('10/10'), 7000);
  });

  await logout();
  await record('AC-43 first-login password change', async () => {
    await fixture.db.account.update({ where: { account: 'S660' }, data: { mustChangePassword: true } });
    await login(origin, 'S660', fixture.password); assert.match(await body(), /首次登录 · 修改密码/);
    const password = randomUUID();
    await browser('find', 'label', '当前初始密码', 'fill', fixture.password);
    await browser('find', 'label', '新密码（10–128 字符）', 'fill', password);
    await browser('find', 'label', '再次输入新密码', 'fill', password);
    await click('修改密码并继续'); await waitFor(async () => (await body()).includes('学生工作台'));
    assert.equal((await fixture.request('/api/auth/login', 'POST', { account: 'S660', password: fixture.password })).status, 401);
  });
  await logout();
  await record('AC-10/47 one-for-one save then submit after first submission', async () => {
    await login(origin, 'S101', fixture.password); await browser('scrollintoview', 'button[aria-label="移除chemistry"]'); await browser('click', 'button[aria-label="移除chemistry"]'); await choose('B1', '主选');
    await click('保存选择'); await waitText('选择已保存'); assert.equal(await registered('B1'), false);
    await click('正式提交'); await click('确认'); await waitText('正式提交成功'); assert.equal(await registered('B1'), true); assert.equal(await registered('M3'), false);
  });
  await record('AC-11/47 confirmed delete followed by a valid rebuild', async () => {
    await click('删除整个课表'); await click('确认'); await waitFor(async () => await fixture.db.registration.count({ where: { studentId: fixture.students[0]!.id, offering: { termId: fixture.ids.T2 }, state: 'COMMITTED' } }) === 0); await waitText('尚无有效注册');
    for (const id of ['M1', 'M2', 'M3', 'M4']) await choose(id, '主选');
    for (const id of ['B1', 'B2']) await choose(id, '备选');
    await click('正式提交'); await click('确认'); await waitText('正式提交成功'); for (const id of ['M1', 'M2', 'M3', 'M4']) assert.equal(await registered(id), true);
  });
  await resetLogin(origin); await login(origin, 'R01', fixture.password);
  await record('AC-52/53 status impact preview supports cancel and confirm', async () => {
    await click('学生管理'); await field('按编号或姓名搜索', 'S205'); await click('搜索'); await waitText('S205'); await rowClick('S205', '编辑'); await waitText('编辑 同名测试学生'); await selectField('人员状态', 'SUSPENDED'); await click('预览并确认修改'); await waitText('受影响班次'); await click('取消'); assert.match(await body(), /编辑/); await click('预览并确认修改'); await click('确认'); await waitText('休学');
    await click('教授管理'); await field('按编号或姓名搜索', 'P27'); await click('搜索'); await waitText('P27'); await rowClick('P27', '编辑'); await waitFor(async () => Boolean(await evaluate(`!!document.querySelector('form select')`))); await selectField('人员状态', 'DEPARTED'); await click('预览并确认修改'); await waitText('受影响班次'); await click('取消'); await click('预览并确认修改'); await click('确认'); await waitText('离职');
  });
  await fixture.register(20, ['B1']); await fixture.register(21, ['B1']); await fixture.register(22, ['B1']);
  // Keep the rebuilt student's four courses alive through close, so the
  // four-course supplement refusal is tested rather than small-class removal.
  for (const offeringId of ['M1', 'M2', 'M3', 'M4']) await fixture.db.registration.createMany({ data: [23, 24].map(i => ({ studentId: fixture.students[i]!.id, offeringId, source: 'SUBMIT' as const })) });
  await record('AC-28/34 close through browser and await billing acknowledgments', async () => {
    await click('关闭、计费与补选'); await browser('find', 'role', 'button', 'click', '--name', '关闭选课', '--exact'); await click('确认');
    await waitFor(async () => (await body()).includes('关闭完成'), 10000);
    await waitFor(async () => await fixture.db.billingOutbox.count({ where: { status: { not: 'ACKNOWLEDGED' } } }) === 0, 10000);
    assert.equal(await fixture.db.billingOutbox.count(), 81); // 80 seeded + one imported student.
    // Wait for the UI's next poll too; DB completion alone can leave a screenshot
    // showing only the first batch of 50 acknowledgments.
    await waitFor(async () => await evaluate(`document.querySelector('.stats > div:nth-child(4) strong')?.textContent`) === '81');
    assert.match(await body(), /关闭完成/); await browser('screenshot', resolve(artifacts, 'closed.png'), '--full');
  });
  await record('BUG-001 billing table identifies students by number and name', async () => {
    const cells = await evaluate(`(() => { const panel=[...document.querySelectorAll('section')].find(p=>p.querySelector('h2')?.textContent==='计费送达状态'); return panel?[...panel.querySelectorAll('tbody tr')].map(r=>[...r.querySelectorAll('td')].slice(0,2).map(td=>td.textContent?.trim())):null; })()`) as string[][] | null;
    assert.ok(cells && cells.length === 81, `billing rows: ${cells?.length}`);
    assert.deepEqual(cells.find(([number]) => number === 'S101'), ['S101', '同名测试学生']);
    assert.equal(cells.some(row => row.some(text => /[0-9a-f]{8}-[0-9a-f]{4}-/.test(text ?? ''))), false);
    await field('按学号或姓名筛选', 'S310');
    await waitFor(async () => Number(await evaluate(`[...document.querySelectorAll('section')].find(p=>p.querySelector('h2')?.textContent==='计费送达状态')?.querySelectorAll('tbody tr').length`)) === 1);
  });
  await record('AC-56 closed term exposes a disabled-window explanation', async () => {
    await click('学期窗口'); await waitText('不能修改窗口'); assert.equal(await evaluate(`document.querySelector('button.primary')?.disabled`), true); await click('关闭、计费与补选');
  });
  await record('AC-57/58 closed-term supplement succeeds through confirmation', async () => {
    await field('查找学生', 'S310'); await click('查找'); await waitText('选择学生'); await selectField('选择学生', fixture.students[2]!.id); await waitText('补选此班次'); await rowClick('B1', '补选此班次'); await click('确认'); await waitText('补选成功'); assert.deepEqual(await fixture.members('B1'), ['S1020', 'S1021', 'S1022', 'S310']);
  });
  await record('AC-62 four-course student cannot be supplemented', async () => {
    await field('查找学生', 'S101'); await click('查找'); await selectField('选择学生', fixture.students[0]!.id); await waitText('已注册'); assert.equal(await evaluate(`[...document.querySelectorAll('button')].filter(e=>e.textContent?.trim()==='补选此班次').every(e=>e.disabled)`), true); assert.match(await body(), /最多四门/);
  });

  const userAgent = String(await evaluate('navigator.userAgent'));
  const report = { executedAt: new Date().toISOString(), command: 'npm run test:e2e', dependency: 'agent-browser 0.33.2 + installed Google Chrome', browser: userAgent, results, summary: { passed: results.filter(r => r.status === 'passed').length, failed: results.filter(r => r.status === 'failed').length }, timingsMs: Object.fromEntries(Object.entries(timings).map(([ac, samples]) => [ac, { samples, max: samples.length ? Math.max(...samples) : null, count: samples.length }])), timingMethod: 'Elapsed from successful business HTTP response / simulator catalogue control response to observed DOM. 50ms polling plus CLI observation overhead. Six paths have ten timed samples; separate checks use two real same-account pages and Chrome offline emulation. Runtime background sync enabled; no direct DB timed transitions.', omitted: ['Windows and Edge', 'acceptance subscenarios not explicitly named in results', 'human review and independent environment'] };
  await writeFile(resolve(artifacts, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (results.some(r => r.status === 'failed')) process.exitCode = 1;
} finally {
  try { await browser('close'); } catch {}
  await stop?.();
  if (server && 'closeAllConnections' in server) server.closeAllConnections();
  if (server) await new Promise<void>(resolveClose => server!.close(() => resolveClose()));
  await fixture.dispose();
}
