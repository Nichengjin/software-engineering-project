#!/usr/bin/env node
// US-030: reproduce the course estimates. Inputs are explicit assumptions, not time logs.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const input = JSON.parse(readFileSync(join(root, 'docs/project-management/estimation-inputs.json'), 'utf8'));
const weights = { EI: [3, 4, 6], EO: [4, 5, 7], EQ: [3, 4, 6], ILF: [7, 10, 15], EIF: [5, 7, 10] };
function rating(item) {
  const det = item.fields.length;
  if (item.type === 'ILF' || item.type === 'EIF') {
    const row = item.rets === 1 ? 0 : item.rets <= 5 ? 1 : 2;
    const col = det <= 19 ? 0 : det <= 50 ? 1 : 2;
    return [[0, 0, 1], [0, 1, 2], [1, 2, 2]][row][col];
  }
  const ftr = item.refs.length;
  const row = item.type === 'EI' ? (ftr <= 1 ? 0 : ftr === 2 ? 1 : 2) : (ftr <= 1 ? 0 : ftr <= 3 ? 1 : 2);
  const col = item.type === 'EI' ? (det <= 4 ? 0 : det <= 15 ? 1 : 2) : (det <= 5 ? 0 : det <= 19 ? 1 : 2);
  return [[0, 0, 1], [0, 1, 2], [1, 2, 2]][row][col];
}
const ids = new Set(input.items.map(i => i.id));
if (ids.size !== input.items.length) throw new Error('Duplicate function point identifiers');
for (const i of input.items) {
  if (!weights[i.type] || !i.fields.length || new Set(i.fields).size !== i.fields.length) throw new Error(`Invalid item: ${i.id}`);
  for (const ref of i.refs) if (!ids.has(ref)) throw new Error(`Unknown data reference: ${ref}`);
}
const items = input.items.map(i => ({ ...i, det: i.fields.length, complexity: ['低', '中', '高'][rating(i)], points: weights[i.type][rating(i)] }));
const totals = Object.fromEntries(Object.keys(weights).map(type => [type, {
  count: items.filter(i => i.type === type).length,
  points: items.filter(i => i.type === type).reduce((sum, i) => sum + i.points, 0),
}]));
const ufp = items.reduce((sum, i) => sum + i.points, 0);
const factorSum = input.factors.reduce((sum, i) => sum + i.value, 0);
const tcf = 0.65 + 0.01 * factorSum;
const hours = input.hours.reduce((sum, h) => sum + h.phases.reduce((a, b) => a + b, 0), 0);
const cocomo = input.klocScenarios.map(kloc => {
  const basicPM = 2.4 * kloc ** 1.05;
  const intermediatePM = 3.2 * kloc ** 1.05; // All 15 EAF factors nominal (1); sensitivity scenario.
  return { kloc, basicPM, basicMonths: 2.5 * basicPM ** 0.38, intermediatePM, intermediateMonths: 2.5 * intermediatePM ** 0.38 };
});
const activities = [];
const pending = [...input.activities];
while (pending.length) {
  const index = pending.findIndex(a => a.after.every(id => activities.some(b => b.id === id)));
  if (index < 0) throw new Error('Cycle or unknown predecessor in CPM inputs');
  const [a] = pending.splice(index, 1);
  if (!Number.isFinite(a.days) || a.days <= 0 || activities.some(b => b.id === a.id)) throw new Error('Invalid CPM activity');
  const es = Math.max(0, ...a.after.map(id => activities.find(b => b.id === id).ef));
  activities.push({ ...a, es, ef: es + a.days });
}
const duration = Math.max(...activities.map(a => a.ef));
for (const a of [...activities].reverse()) {
  const successors = activities.filter(b => b.after.includes(a.id));
  a.lf = successors.length ? Math.min(...successors.map(b => b.ls)) : duration;
  a.ls = a.lf - a.days; a.float = a.ls - a.es;
}
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);
}
const source = ['apps/api/src', 'apps/web/src', 'apps/simulators/src', 'packages/contracts/src', 'packages/db/src'].map(dir => {
  const selected = files(join(root, dir)).filter(p => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p));
  return { dir, files: selected.length, nonblankLines: selected.reduce((sum, p) => sum + readFileSync(p, 'utf8').split(/\r?\n/).filter(l => l.trim()).length, 0) };
});
const result = { asOf: input.asOf, totals, ufp, factorSum, tcf, adjustedFP: ufp * tcf, hours, personMonths: hours / input.hoursPerPersonMonth, cocomo, cpm: { duration, activities }, source, items };
if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`UFP=${ufp}; ΣFi=${factorSum}; TCF=${tcf.toFixed(2)}; FP=${(ufp * tcf).toFixed(2)}`);
  console.log(`回顾估算=${hours}人时; ${input.hoursPerPersonMonth}小时/人月 => ${(hours / input.hoursPerPersonMonth).toFixed(3)}人月`);
  console.log('| KLOC | 基本人月 | 基本月数 | 中级人月 EAF=1 | 中级月数 |\n| --- | --- | --- | --- | --- |');
  for (const c of cocomo) console.log(`| ${c.kloc} | ${c.basicPM.toFixed(2)} | ${c.basicMonths.toFixed(2)} | ${c.intermediatePM.toFixed(2)} | ${c.intermediateMonths.toFixed(2)} |`);
  console.log('\n| 活动 | 持续天 | ES | EF | LS | LF | 总时差 |\n| --- | --- | --- | --- | --- | --- | --- |');
  for (const a of activities) console.log(`| ${a.id} ${a.name} | ${a.days} | ${a.es} | ${a.ef} | ${a.ls} | ${a.lf} | ${a.float} |`);
  console.log(`\n项目持续 ${duration} 天；零时差活动：${activities.filter(a => a.float === 0).map(a => a.id).join('、')}`);
  console.log('TS/TSX 非空物理行（含注释，不含测试、CSS、schema、seed、迁移或生成代码）：');
  for (const s of source) console.log(`${s.dir}: ${s.nonblankLines}`);
}
