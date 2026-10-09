#!/usr/bin/env node
// McCabe 环形复杂度：V(G) = 判定结点数 P + 1（课件 6.4）。复合条件按简单条件拆开计数，
// 本脚本的固定口径：if、?:、for／for-in／for-of／while／do、case、catch、
// &&、||、?? 各算一个判定；嵌套函数（含数组方法的回调）单独计算，不并入外层。
// optional chaining 和默认参数不另计；不声称等同 ESLint 或完整隐含控制流展开。
// 用法：node scripts/complexity-report.mjs [--min=N] [--json] [目录或文件…]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const args = process.argv.slice(2);
const min = Number(args.find(a => a.startsWith('--min='))?.slice(6) ?? 1);
const asJson = args.includes('--json');
const roots = args.filter(a => !a.startsWith('--'));
const dirs = roots.length ? roots : ['apps/api/src', 'apps/simulators/src', 'apps/web/src', 'packages/contracts/src'];

function files(dir) {
  if (!statSync(dir).isDirectory()) return [dir];
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const decisionKinds = new Set([
  ts.SyntaxKind.IfStatement, ts.SyntaxKind.ConditionalExpression, ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement, ts.SyntaxKind.ForOfStatement, ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement, ts.SyntaxKind.CaseClause, ts.SyntaxKind.CatchClause,
]);
const logical = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]);
const isFunction = node => ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node)
  || ts.isFunctionExpression(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node);

function nameOf(node, source) {
  if (node.name) return node.name.getText(source);
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) return parent.name.getText(source);
  if (ts.isCallExpression(parent)) return `(${parent.expression.getText(source).split('\n')[0].slice(-40)} 回调)`;
  return '(匿名)';
}

const results = [];
for (const file of dirs.flatMap(files)) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visitFunction = fn => {
    let decisions = 0;
    const walk = node => {
      if (node !== fn && isFunction(node)) { visitFunction(node); return; }
      if (decisionKinds.has(node.kind)) decisions++;
      if (ts.isBinaryExpression(node) && logical.has(node.operatorToken.kind)) decisions++;
      ts.forEachChild(node, walk);
    };
    ts.forEachChild(fn, walk);
    const { line } = source.getLineAndCharacterOfPosition(fn.getStart(source));
    results.push({ file: relative(process.cwd(), file), line: line + 1, name: nameOf(fn, source), decisions, complexity: decisions + 1 });
  };
  const top = node => { if (isFunction(node)) visitFunction(node); else ts.forEachChild(node, top); };
  top(source);
}

const shown = results.filter(r => r.complexity >= min).sort((a, b) => b.complexity - a.complexity || a.file.localeCompare(b.file));
if (asJson) { console.log(JSON.stringify({ functions: results.length, shown }, null, 2)); process.exit(0); }
const buckets = [[1, 5], [6, 9], [10, 20], [21, Infinity]].map(([lo, hi]) => [`${lo}${hi === Infinity ? '+' : `–${hi}`}`, results.filter(r => r.complexity >= lo && r.complexity <= hi).length]);
console.log(`函数总数 ${results.length}；V(G) 分布：${buckets.map(([k, n]) => `${k}：${n}`).join('，')}`);
console.log('| V(G) | 判定数 | 函数 | 位置 |\n| --- | --- | --- | --- |');
for (const r of shown) console.log(`| ${r.complexity} | ${r.decisions} | \`${r.name}\` | \`${r.file}:${r.line}\` |`);
