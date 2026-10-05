import { describe, expect, it } from 'vitest';
import { repository, runMember, tasks } from './member-pr.mjs';

type PR = {
  number: number; state: string; merged: boolean; draft: boolean; title: string; body: string;
  user: { login: string }; html_url: string;
  head: { ref: string; sha: string; repo: { full_name: string } };
  base: { ref: string; repo: { full_name: string } };
};
type Call = { method: string; path: string; data: Record<string, unknown> };
const branch = 'feat/haoyu/us-004-web-shell';
const alias = `${branch}-member-pr`;
const sha = '0123456789abcdef0123456789abcdef01234567';

// A stateful GitHub substitute: no real credentials, network, Git writes or PRs.
function github() {
  const state = {
    login: 'student-H', push: true, squash: false, calls: [] as Call[],
    refs: new Map<string, string>(), prs: new Map<number, PR>(),
    comments: new Map<number, { user: { login: string }; body: string }[]>(),
    before: (_call: Call) => {}, after: (_call: Call) => {},
  };
  function pr(number: number, head: string, login: string, body: string): PR {
    return {
      number, state: 'open', merged: false, draft: true, title: `feat(test): 工作包 (US-004)`, body,
      user: { login }, html_url: `https://github.com/${repository}/pull/${number}`,
      head: { ref: head, sha: state.refs.get(head)!, repo: { full_name: repository } },
      base: { ref: 'main', repo: { full_name: repository } },
    };
  }
  for (const task of tasks) {
    state.refs.set(task.branch, task.pr === 11 ? sha : task.pr.toString(16).padStart(40, '0'));
    state.prs.set(task.pr, pr(task.pr, task.branch, 'Nichengjin', '原始历史说明；未完成验收。'));
  }
  const run = (args: string[], input = '') => {
    expect(args.slice(0, 3)).toEqual(['api', '--hostname', 'github.com']);
    const path = args[3]!;
    const method = args[args.indexOf('--method') + 1]!;
    const data = input ? JSON.parse(input) as Record<string, unknown> : {};
    const call = { path, method, data };
    state.calls.push(call);
    state.before(call);
    const prefix = `repos/${repository}`;
    let result: unknown;
    if (path === 'user') result = { login: state.login };
    else if (path === prefix) result = {
      full_name: repository, permissions: { push: state.push }, default_branch: 'main',
      allow_merge_commit: true, allow_squash_merge: state.squash, allow_rebase_merge: false,
    };
    else if (path.startsWith(`${prefix}/git/ref/heads/`)) {
      result = { object: { sha: state.refs.get(path.slice(`${prefix}/git/ref/heads/`.length)) } };
    } else if (path.startsWith(`${prefix}/git/matching-refs/heads/`)) {
      const name = path.slice(`${prefix}/git/matching-refs/heads/`.length);
      result = [...state.refs].filter(([ref]) => ref.startsWith(name)).map(([ref, value]) => ({ ref: `refs/heads/${ref}`, object: { sha: value } }));
    } else if (path === `${prefix}/git/refs` && method === 'POST') {
      const name = String(data.ref).replace('refs/heads/', '');
      if (state.refs.has(name)) throw new Error('422 ref already exists');
      state.refs.set(name, String(data.sha));
      result = { ref: data.ref, object: { sha: data.sha } };
    } else if (path.startsWith(`${prefix}/pulls?`)) {
      const query = new URLSearchParams(path.split('?')[1]);
      expect(query.get('state')).toBe('all');
      expect(args).toContain('--paginate');
      expect(args).toContain('--slurp');
      const head = query.get('head')!.split(':')[1];
      // Put matches on a later page to catch missing pagination/flattening.
      result = [[], [...state.prs.values()].filter(p => p.head.ref === head && p.base.ref === query.get('base'))];
    } else if (path === `${prefix}/pulls` && method === 'POST') {
      if ([...state.prs.values()].some(p => p.state === 'open' && p.head.ref === data.head && p.base.ref === data.base)) {
        throw new Error('422 PR already exists for head/base');
      }
      expect(state.refs.has(String(data.head))).toBe(true);
      const created = pr(100 + state.prs.size, String(data.head), state.login, String(data.body));
      created.draft = Boolean(data.draft);
      created.title = String(data.title);
      state.prs.set(created.number, created);
      result = created;
    } else if (path.startsWith(`${prefix}/pulls/`)) {
      const found = state.prs.get(Number(path.split('/').at(-1)))!;
      if (method === 'PATCH') {
        expect(data).toEqual({ state: 'closed' });
        found.state = 'closed';
      }
      result = found;
    } else if (path.includes('/comments')) {
      const number = Number(path.split('/')[4]);
      const comments = state.comments.get(number) || [];
      if (method === 'POST') {
        comments.push({ user: { login: state.login }, body: String(data.body) });
        state.comments.set(number, comments);
        result = comments.at(-1);
      } else result = [[], comments];
    } else throw new Error(`Unexpected endpoint: ${method} ${path}`);
    state.after(call);
    return JSON.stringify(result);
  };
  return { state, run, log: () => {} };
}

function execute(fake: ReturnType<typeof github>, apply = true) {
  runMember(['haoyu', '--login', fake.state.login, '--task', 'P03b', ...(apply ? ['--apply'] : [])], fake);
}
const writes = (fake: ReturnType<typeof github>) => fake.state.calls.filter(call => call.method !== 'GET');

describe('member PR handoff', () => {
  it('keeps the agreed task allocation and every predecessor valid', () => {
    const allocation = Object.fromEntries(['nichengjin', 'haoyu', 'mazhe', 'fenghaiyang', 'fanzhao', 'fenghailun']
      .map(member => [member, tasks.filter(t => t.member === member).map(t => t.pr).sort((a, b) => a - b)]));
    expect(allocation).toEqual({ nichengjin: [6, 8, 10, 13, 14, 20, 22], haoyu: [11, 16], mazhe: [15], fenghaiyang: [17, 18, 21], fanzhao: [7, 9, 12, 19, 23], fenghailun: [] });
    for (const task of tasks) for (const dep of task.dependencies) expect(dep).toBeLessThan(task.pr);
  });

  it('defaults to read-only even when a replacement is needed', () => {
    const fake = github(); execute(fake, false);
    expect(writes(fake)).toEqual([]);
    expect(fake.state.refs.has(alias)).toBe(false);
    expect(fake.state.prs.get(11)?.state).toBe('open');
  });

  it('preserves the commit, creates a draft first, verifies it, links then closes only the old PR', () => {
    const fake = github(); execute(fake);
    expect(writes(fake).map(c => [c.method, c.path.split(repository)[1]])).toEqual([
      ['POST', '/git/refs'], ['POST', '/pulls'], ['POST', '/issues/11/comments'], ['PATCH', '/pulls/11'],
    ]);
    expect(fake.state.refs.get(alias)).toBe(sha);
    const replacement = [...fake.state.prs.values()].find(p => p.head.ref === alias)!;
    expect(replacement).toMatchObject({ draft: true, state: 'open', merged: false, user: { login: 'student-H' }, head: { sha, ref: alias } });
    expect(replacement.body).toContain('原始历史说明');
    expect(replacement.body).toContain('前置原 PR #10');
    expect(replacement.body).toContain('不表示已完成审阅');
    expect(fake.state.prs.get(11)?.state).toBe('closed');
    expect(fake.state.prs.get(16)?.state).toBe('open');
    const verifiedAt = fake.state.calls.findIndex(c => c.method === 'GET' && c.path.endsWith(`/pulls/${replacement.number}`));
    expect(verifiedAt).toBeGreaterThan(fake.state.calls.findIndex(c => c.method === 'POST' && c.path.endsWith('/pulls')));
    expect(verifiedAt).toBeLessThan(fake.state.calls.findIndex(c => c.method === 'PATCH'));
    const count = writes(fake).length;
    execute(fake);
    expect(writes(fake)).toHaveLength(count);
  });

  it.each(['ref', 'create', 'comment', 'close'])('resumes safely after a successful %s whose response was lost', stage => {
    const fake = github();
    fake.state.after = call => {
      const fail = stage === 'ref' ? call.method === 'POST' && call.path.endsWith('/git/refs')
        : stage === 'create' ? call.method === 'POST' && call.path.endsWith('/pulls')
        : stage === 'comment' ? call.method === 'POST' && call.path.endsWith('/comments') : call.method === 'PATCH';
      if (fail) throw new Error('lost response');
    };
    expect(() => execute(fake)).toThrow('lost response');
    if (stage !== 'close') expect(fake.state.prs.get(11)?.state).toBe('open');
    fake.state.after = () => {};
    execute(fake);
    expect([...fake.state.prs.values()].filter(p => p.head.ref === alias)).toHaveLength(1);
    expect(fake.state.comments.get(11)).toHaveLength(1);
    expect(fake.state.prs.get(11)?.state).toBe('closed');
  });

  it.each(['ref', 'create', 'comment', 'close'])('keeps the old PR open on a rejected %s write and can resume', stage => {
    const fake = github();
    fake.state.before = call => {
      const suffix = { ref: '/git/refs', create: '/pulls', comment: '/comments', close: '/pulls/11' }[stage]!;
      if (call.method !== 'GET' && call.path.endsWith(suffix)) throw new Error('403 denied');
    };
    expect(() => execute(fake)).toThrow('403 denied');
    expect(fake.state.prs.get(11)?.state).toBe('open');
    fake.state.before = () => {};
    execute(fake);
    expect(fake.state.prs.get(11)?.state).toBe('closed');
    expect([...fake.state.prs.values()].filter(p => p.head.ref === alias)).toHaveLength(1);
  });

  it.each(['login', 'owner', 'permission', 'settings', 'assignment'])('blocks %s mistakes before any writes', problem => {
    const fake = github();
    if (problem === 'owner') fake.state.login = 'Nichengjin';
    if (problem === 'permission') fake.state.push = false;
    if (problem === 'settings') fake.state.squash = true;
    expect(() => runMember(['haoyu', '--login', problem === 'login' ? 'different-user' : fake.state.login,
      '--task', problem === 'assignment' ? 'P06' : 'P03b', '--apply'], fake)).toThrow();
    expect(writes(fake)).toEqual([]);
  });

  it('will not overwrite a preexisting alias with different content', () => {
    const fake = github(); fake.state.refs.set(alias, 'a'.repeat(40));
    expect(() => execute(fake)).toThrow('不同提交');
    expect(writes(fake)).toEqual([]);
  });

  it.each(['author', 'closed', 'body', 'base', 'fork'])('refuses an existing replacement with wrong %s', problem => {
    const fake = github(); execute(fake);
    const replacement = [...fake.state.prs.values()].find(p => p.head.ref === alias)!;
    if (problem === 'author') replacement.user.login = 'someone-else';
    if (problem === 'closed') replacement.state = 'closed';
    if (problem === 'body') replacement.body = 'unrelated';
    if (problem === 'base') replacement.base.ref = 'other';
    if (problem === 'fork') replacement.head.repo.full_name = 'other/repo';
    const count = writes(fake).length;
    expect(() => execute(fake)).toThrow();
    expect(writes(fake)).toHaveLength(count);
  });

  it('does not close after concurrent source movement during the linking comment', () => {
    const fake = github();
    fake.state.after = call => {
      if (call.method === 'POST' && call.path.endsWith('/comments')) {
        fake.state.refs.set(branch, 'b'.repeat(40));
        fake.state.prs.get(11)!.head.sha = 'b'.repeat(40);
      }
    };
    expect(() => execute(fake)).toThrow('版本又发生变化');
    expect(fake.state.prs.get(11)?.state).toBe('open');
    expect(writes(fake).some(c => c.method === 'PATCH')).toBe(false);
  });

  it('resumes a partially finished member batch without repeating its first task', () => {
    const fake = github();
    const args = ['haoyu', '--login', 'student-H', '--apply'];
    fake.state.before = call => {
      if (call.method === 'POST' && call.path.endsWith('/pulls') && call.data.head !== alias) throw new Error('second task denied');
    };
    expect(() => runMember(args, fake)).toThrow('second task denied');
    expect(fake.state.prs.get(11)?.state).toBe('closed');
    expect(fake.state.prs.get(16)?.state).toBe('open');
    fake.state.before = () => {};
    runMember(args, fake);
    const replacements = [...fake.state.prs.values()].filter(p => p.user.login === 'student-H');
    expect(replacements).toHaveLength(2);
    expect(new Set(replacements.map(p => p.head.sha)).size).toBe(2);
    expect(fake.state.comments.get(11)).toHaveLength(1);
    expect(fake.state.prs.get(16)?.state).toBe('closed');
  });

  it('skips merged work, retains the owner PRs, and gives the tester no synthetic PR', () => {
    const fake = github();
    fake.state.prs.get(11)!.merged = true;
    fake.state.prs.get(11)!.state = 'closed';
    execute(fake);
    fake.state.login = 'Nichengjin';
    runMember(['nichengjin', '--login', 'nichengjin', '--apply'], fake);
    const count = fake.state.calls.length;
    runMember(['fenghailun', '--apply'], fake);
    expect(fake.state.calls).toHaveLength(count);
    expect(writes(fake)).toEqual([]);
  });
});
