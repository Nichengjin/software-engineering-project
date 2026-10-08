import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { categories, classify, parseTree, summarize } from './release-manifest.mjs';

describe('configuration item inventory', () => {
  it('classifies representative paths into the planned categories', () => {
    expect(classify('packages/db/prisma/migrations/202610050001_initial/migration.sql')).toBe('database');
    expect(classify('packages/db/prisma/schema.prisma')).toBe('database');
    expect(classify('packages/db/prisma/seed.ts')).toBe('seed-data');
    expect(classify('packages/db/seed/catalog.json')).toBe('seed-data');
    expect(classify('apps/api/test/rules.test.ts')).toBe('test');
    expect(classify('packages/db/src/seed.integration.test.ts')).toBe('test');
    expect(classify('apps/web/package.json')).toBe('build-config');
    expect(classify('package-lock.json')).toBe('build-config');
    expect(classify('apps/api/src/server.ts')).toBe('source');
    expect(classify('.env.example')).toBe('runtime-config');
    expect(classify('.github/workflows/release.yml')).toBe('process-tooling');
    expect(classify('docs/lecture-requirements/2026年软件工程课程设计要求.md')).toBe('course-input');
    expect(classify('docs/TEST_REPORT.md')).toBe('test-docs');
    expect(classify('docs/CONFIG_MANAGEMENT_PLAN.md')).toBe('project-docs');
  });

  it('keeps tab-separated paths with spaces and non-ASCII names intact', () => {
    const output = '100644 blob abc123     42\tdocs/lecture-notes/text/4.1需求分析 - 任务.txt\x00100755 blob def456   7\t.agents/setup\x00';
    expect(parseTree(output)).toEqual([
      { path: 'docs/lecture-notes/text/4.1需求分析 - 任务.txt', category: 'course-input', type: 'blob', blob: 'abc123', bytes: 42 },
      { path: '.agents/setup', category: 'runtime-config', type: 'blob', blob: 'def456', bytes: 7 },
    ]);
  });

  it('assigns every tracked file of this commit and omits empty categories', () => {
    const items = parseTree(execFileSync('git', ['ls-tree', '-r', '-z', '--long', 'HEAD'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    const summary = summarize(items);
    expect(summary.reduce((total, category) => total + category.count, 0)).toBe(items.length);
    expect(summary.every((category) => category.count > 0)).toBe(true);
    expect(summary.map((category) => category.id)).toEqual(expect.arrayContaining(['source', 'database', 'test', 'build-config', 'runtime-config']));
    expect(new Set(categories.map((category) => category.id)).size).toBe(categories.length);
  });
});
