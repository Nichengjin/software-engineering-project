import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Configuration item categories, see docs/CONFIG_MANAGEMENT_PLAN.md section 2. First match wins.
export const categories = [
  { id: 'course-input', label: '课程输入资料', match: (p) => /^docs\/lecture-(requirements|notes)\//.test(p) },
  { id: 'database', label: '数据模型与迁移', match: (p) => /^packages\/db\/prisma\/(schema\.prisma|migrations\/)/.test(p) },
  { id: 'seed-data', label: '虚构演示数据与初始化', match: (p) => /^packages\/db\/(seed\/|prisma\/seed\.ts$)/.test(p) || p === 'scripts/export-fixtures.ts' },
  { id: 'test', label: '自动化测试', match: (p) => /^tests\//.test(p) || /\/test\//.test(p) || /\.test\.tsx?$/.test(p) },
  { id: 'build-config', label: '依赖与构建配置', match: (p) => /(^|\/)(package(-lock)?\.json|tsconfig(\.base)?\.json|vite\.config\.ts|vitest\.config\.ts)$/.test(p) || p === '.nvmrc' },
  { id: 'source', label: '程序源代码', match: (p) => /^(apps|packages)\//.test(p) },
  { id: 'runtime-config', label: '运行配置示例', match: (p) => ['.env.example', 'compose.yaml', '.amp/services.yaml', '.agents/setup'].includes(p) },
  { id: 'process-tooling', label: '工程流程与自动化', match: (p) => /^(\.github|scripts)\//.test(p) || ['Makefile', 'CODEOWNERS', '.editorconfig', '.gitattributes', '.gitignore', '.markdownlint.json'].includes(p) },
  { id: 'design-docs', label: '分析与设计文档', match: (p) => /^docs\/design-docs\//.test(p) || ['docs/ARCHITECTURE.md', 'docs/DESIGN.md', 'docs/FRONTEND.md', 'docs/SIMULATORS.md'].includes(p) },
  { id: 'requirements', label: '需求与追溯', match: (p) => /^docs\/product-specs\//.test(p) || p === 'docs/REQUIREMENTS_ANALYSIS.md' },
  { id: 'test-docs', label: '测试计划与报告', match: (p) => /^docs\/testing\//.test(p) || ['docs/TEST_PLAN.md', 'docs/TEST_REPORT.md', 'docs/TESTING.md'].includes(p) },
  { id: 'records', label: '过程记录与汇报', match: (p) => /^docs\/(histories|exec-plans|iterations|work-reports|releases)\//.test(p) },
  { id: 'project-docs', label: '项目管理与协作文档', match: () => true },
];

export function classify(path) {
  return categories.find((category) => category.match(path)).id;
}

// Parses `git ls-tree -r -z --long` output: "<mode> <type> <object> <size>\t<path>\0".
export function parseTree(output) {
  return output.split('\0').filter(Boolean).map((entry) => {
    const tab = entry.indexOf('\t');
    const [, type, blob, size] = entry.slice(0, tab).trim().split(/\s+/);
    const path = entry.slice(tab + 1);
    return { path, category: classify(path), type, blob, bytes: type === 'blob' ? Number(size) : null };
  });
}

export function summarize(items) {
  return categories
    .map(({ id, label }) => ({ id, label, count: items.filter((item) => item.category === id).length }))
    .filter((category) => category.count > 0);
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function option(args, name) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}

function main(args) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const sha = option(args, 'sha');
  const out = option(args, 'out');
  const artifacts = args.flatMap((arg, index) => (args[index - 1] === '--artifact' ? [arg] : []));
  if (!sha || !out || artifacts.length === 0) throw new Error('用法: release-manifest.mjs --sha <commit> --out <dir> --artifact <file>...');

  const git = (...gitArgs) => execFileSync('git', ['-C', root, ...gitArgs], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const items = parseTree(git('ls-tree', '-r', '-z', '--long', sha));
  const pkg = JSON.parse(git('show', `${sha}:package.json`));
  const migrations = items
    .filter((item) => /^packages\/db\/prisma\/migrations\/[^/]+\/migration\.sql$/.test(item.path))
    .map((item) => item.path.split('/')[4]);

  writeFileSync(join(out, 'config-items.json'), `${JSON.stringify({ schemaVersion: 1, git_sha: sha, categories: summarize(items), items }, null, 2)}\n`);
  const manifest = {
    schemaVersion: 1,
    product: pkg.name,
    package_version: pkg.version,
    repository: process.env.GITHUB_REPOSITORY || 'local',
    git_sha: sha,
    release_tag: process.env.RELEASE_TAG || '',
    generated_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    // Local runs archive the commit only; uncommitted changes are never packaged but are flagged.
    worktree_dirty: git('status', '--porcelain', '--untracked-files=no').trim() !== '',
    runtime: { node: pkg.engines?.node ?? '', package_manager: pkg.packageManager ?? '', postgres: '15' },
    migrations,
    config_items: { file: 'config-items.json', total: items.length, categories: summarize(items) },
    artifacts: artifacts.map((file) => ({ name: basename(file), bytes: statSync(file).size, sha256: sha256(file) })),
  };
  writeFileSync(join(out, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
