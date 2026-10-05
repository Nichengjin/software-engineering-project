import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export const repository = 'Nichengjin/software-engineering-project';
const owner = 'Nichengjin';
export const members = {
  nichengjin: '倪成锦', haoyu: '浩宇', mazhe: '马喆',
  fenghaiyang: '冯海洋', fanzhao: '范昭', fenghailun: '冯海伦',
};
// Keep the original PR numbers as stable handoff identifiers, even after closing them.
/** @type {[string, string, number, number[]][]} */
const taskRows = [
  ['P01', 'docs/nichengjin/us-026-design', 6, []],
  ['P02a', 'chore/fanzhao/us-027-workspace', 7, [6]],
  ['P02b', 'feat/nichengjin/us-026-data-contracts', 8, [7]],
  ['P02c', 'chore/fanzhao/us-027-runtime-seed', 9, [8]],
  ['P03a', 'feat/nichengjin/us-004-auth', 10, [9]],
  ['P03b', 'feat/haoyu/us-004-web-shell', 11, [10]],
  ['P04a', 'feat/fanzhao/us-016-simulators', 12, [9]],
  ['P04b', 'feat/nichengjin/us-005-catalog', 13, [10, 12]],
  ['P05a', 'feat/nichengjin/us-007-schedules', 14, [13]],
  ['P06', 'feat/mazhe/us-009-teaching-grades', 15, [14, 11]],
  ['P05b', 'feat/haoyu/us-006-student', 16, [15]],
  ['P07a', 'feat/fenghaiyang/us-023-people-imports', 17, [15]],
  ['P07b', 'feat/fenghaiyang/us-021-term-windows', 18, [17]],
  ['P08b', 'feat/fanzhao/us-016-billing', 19, [18]],
  ['P08a', 'feat/nichengjin/us-015-closing', 20, [19]],
  ['P08c', 'feat/fenghaiyang/us-022-close-supplement', 21, [20]],
  ['P09b', 'feat/nichengjin/us-027-integration', 22, [21, 16]],
  ['P09a', 'ci/fanzhao/us-027-checks', 23, [22]],
];
export const tasks = taskRows.map(([id, branch, pr, dependencies]) => ({
  id, branch, pr, dependencies, member: branch.split('/')[1], replacement: `${branch}-member-pr`,
}));

function exec(args, input = '') {
  try {
    return execFileSync('gh', args, {
      input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GH_PROMPT_DISABLED: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    // Do not echo credentials, command output, or retry a possibly successful write.
    throw new Error('GitHub 请求失败或结果未知。检查 gh 登录／权限／网络后先重跑预览；不要手动重复建 PR。旧 PR 只有在新 PR 核实后才会关闭。');
  }
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

/** Prepare or execute one member's handoffs. All network I/O goes through gh. */
export function runMember(argv, { run = exec, log = console.log } = {}) {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: { login: { type: 'string' }, task: { type: 'string' }, apply: { type: 'boolean' }, help: { type: 'boolean' } },
  });
  if (values.help) {
    log('用法：node scripts/member-pr.mjs <成员标识> --login <本人GitHub账号> [--task P03b] [--apply]');
    log('默认只读预览；--apply 创建接手分支与草稿 PR，核实后关闭旧 PR；不提交代码、审批或合并。');
    log(Object.entries(members).map(([id, name]) => `${id}=${name}`).join('，'));
    return;
  }
  const member = positionals[0];
  check(positionals.length === 1 && Object.hasOwn(members, member), '请指定一个有效成员标识；使用 --help 查看。');
  const assigned = tasks.filter(task => task.member === member);
  const selected = values.task ? assigned.filter(task => task.id === values.task) : assigned;
  check(!values.task || selected.length === 1, '该任务不属于所选成员，或尚未形成可接手 PR。');
  if (!selected.length) {
    log('冯海伦：尚无可替换 PR。请先执行独立验收、提交实际用例／报告，再自行创建 US-018 PR；本脚本不制造空提交或测试结果。');
    return;
  }
  check(typeof values.login === 'string' && /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(values.login), '必须用 --login 明确填写本人 GitHub 账号（不是姓名或邮箱）。');
  const api = (path, method = 'GET', data = undefined, pages = false) => {
    const args = ['api', '--hostname', 'github.com', path, '--method', method];
    if (pages) args.push('--paginate', '--slurp');
    if (data) args.push('--input', '-');
    return JSON.parse(run(args, data ? JSON.stringify(data) : ''));
  };
  const endpoint = `repos/${repository}`;
  const user = api('user');
  const sameLogin = (a, b) => a?.toLowerCase() === b?.toLowerCase();
  check(sameLogin(user.login, values.login), '当前 gh 账号与 --login 不一致。请本人先 gh auth switch --hostname github.com --user <账号>。');
  check(member === 'nichengjin' ? sameLogin(user.login, owner) : !sameLogin(user.login, owner), '不能用组长账号替其他成员发起 PR，也不能用其他账号接手组长任务。');
  const repo = api(endpoint);
  check(repo.full_name === repository && repo.permissions?.push, '需要本仓库 Write 权限；先接受仓库协作者邀请。不会自动 fork 或修改权限。');
  check(repo.default_branch === 'main' && repo.allow_merge_commit && !repo.allow_squash_merge && !repo.allow_rebase_merge,
    '仓库应以 main 为默认分支且只允许 merge commit，请联系组长核对设置。');
  log(`${members[member]} / GitHub ${user.login}：${values.apply ? '执行接手' : '只读预览'}，共 ${selected.length} 项。`);
  const readPR = number => api(`${endpoint}/pulls/${number}`);
  const validatePR = (pr, branch) => {
    check(pr.base?.repo?.full_name === repository && pr.head?.repo?.full_name === repository
      && pr.base.ref === 'main' && pr.head.ref === branch, 'PR 仓库或分支不符合计划，停止，不能自动接手。');
  };
  const sourceSHA = task => api(`${endpoint}/git/ref/heads/${task.branch}`).object.sha;

  for (const task of selected) {
    let original = readPR(task.pr);
    validatePR(original, task.branch);
    check(sameLogin(original.user?.login, owner), '原 PR 创建者已不同于集中创建账号，停止核对。');
    if (original.merged) {
      log(`${task.id}：原 PR #${task.pr} 已合入，跳过；不会重开或重复交付。`);
      continue;
    }
    if (sameLogin(original.user.login, user.login)) {
      check(original.state === 'open', '本人的原 PR 已关闭但未合入，请人工核对；不会重开。');
      log(`${task.id}：保留本人已有 PR ${original.html_url}，无需替换。`);
      continue;
    }
    const sha = sourceSHA(task);
    check(/^[a-f\d]{40}$/.test(sha) && original.head.sha === sha, '源分支和原 PR 版本不同，稍后重新预览。');
    const marker = `<!-- wylie-member-handoff:${task.id}:original-${task.pr} -->`;
    const matches = api(`${endpoint}/pulls?state=all&head=${owner}:${task.replacement}&base=main&per_page=100`, 'GET', undefined, true).flat();
    check(matches.length <= 1, '存在多个接手 PR，请组长人工核对，不会自动关闭任何一个。');
    let replacement = matches[0];
    const validateReplacement = pr => {
      validatePR(pr, task.replacement);
      check(pr.state === 'open' && !pr.merged && sameLogin(pr.user?.login, user.login)
        && pr.head.sha === sha && pr.body?.includes(marker), '已有接手 PR 的作者、版本、状态或标记不符，停止；不会覆盖或重建。');
    };
    if (replacement) validateReplacement(replacement);
    else check(original.state === 'open', '旧 PR 已关闭且没有接手 PR，请人工核对，不能自动替换。');
    const refs = api(`${endpoint}/git/matching-refs/heads/${task.replacement}`);
    const ref = refs.find(item => item.ref === `refs/heads/${task.replacement}`);
    check(!ref || ref.object.sha === sha, '接手分支已有不同提交，停止；不会强推或覆盖。');
    check(!replacement || ref, '已有 PR 的接手分支不存在，请人工核对。');
    log(`${task.id}：#${task.pr} → ${replacement ? replacement.html_url : task.replacement + '（新草稿 PR）'}；提交 ${sha}；前置原 PR ${task.dependencies.join(', ') || '无'}。`);
    if (!values.apply) continue;

    if (!ref) {
      // A ref to an existing commit preserves all authors, dates and parent links.
      api(`${endpoint}/git/refs`, 'POST', { ref: `refs/heads/${task.replacement}`, sha });
    }
    if (!replacement) {
      check(sourceSHA(task) === sha, '创建分支后源版本发生变化；保留旧 PR，重新核对后再运行。');
      const dependencies = task.dependencies.map(number => {
        const dependency = tasks.find(item => item.pr === number);
        const query = encodeURIComponent(`is:pr head:${dependency.replacement}`);
        return `- 前置原 PR #${number}（${dependency.id}）；[查找成员替代 PR](https://github.com/${repository}/pulls?q=${query})。关闭原 PR 不表示前置已合入。`;
      }).join('\n');
      replacement = api(`${endpoint}/pulls`, 'POST', {
        title: original.title, head: task.replacement, base: 'main', draft: true,
        body: `${marker}\n## 成员接手\n\n由 GitHub ${user.login} 发起，接手 ${members[member]} 的 ${task.id}，替代 #${task.pr}。复用已有 AI 辅助提交，不改作者、日期或提交图；发起 PR 不表示已完成审阅、测试或独立开发。\n\n${dependencies}\n\n- [ ] 本人检查实际任务差异与适用测试\n- [ ] 组长确认前置已合入 main、当前检查通过后安排审阅\n\n当前 CI／安全失败仍需处理，不会自动审批、转为待审或合并。原 PR 的评论与检查留在 #${task.pr}，不会迁移成此 PR 的审批。\n\n<details>\n<summary>原 PR 说明（创建当时的历史记录，不是本次验收结论）</summary>\n\n${original.body || ''}\n\n</details>`,
      });
    }
    check(Number.isSafeInteger(replacement.number), '新 PR 返回结果不完整，请重跑预览核对，不会关闭旧 PR。');
    replacement = readPR(replacement.number);
    validateReplacement(replacement);
    original = readPR(task.pr);
    validatePR(original, task.branch);
    check(!original.merged && original.head.sha === sha && sourceSHA(task) === sha, '关闭前发现原 PR 或源分支变化，保留原 PR，请人工处理。');
    const comments = api(`${endpoint}/issues/${task.pr}/comments?per_page=100`, 'GET', undefined, true).flat();
    const linkMarker = `<!-- wylie-member-replacement:${replacement.number} -->`;
    if (!comments.some(comment => sameLogin(comment.user?.login, user.login) && comment.body?.includes(linkMarker))) {
      api(`${endpoint}/issues/${task.pr}/comments`, 'POST', {
        body: `${linkMarker}\nGitHub ${user.login} 已创建成员接手草稿 PR #${replacement.number}：${replacement.html_url}。两者接手时提交相同，保留原讨论；关闭本 PR 仅为去重，不表示审阅通过或已合入。`,
      });
    }
    if (original.state === 'open') {
      validateReplacement(readPR(replacement.number));
      const latest = readPR(task.pr);
      validatePR(latest, task.branch);
      check(!latest.merged && latest.head.sha === sha && sourceSHA(task) === sha,
        '记录替代关系后版本又发生变化，停止关闭，请人工处理。');
      api(`${endpoint}/pulls/${task.pr}`, 'PATCH', { state: 'closed' });
    }
    const closed = readPR(task.pr);
    check(closed.state === 'closed' && !closed.merged, '旧 PR 状态未确认，请重新预览核对。');
    log(`完成 ${task.id}：${replacement.html_url}；原 #${task.pr} 已关闭但保留讨论。新 PR 仍是草稿，请组长更新任务索引。`);
  }
  if (!values.apply) log('预览结束，没有修改远程。核对账号、任务与版本后，加 --apply 执行；失败后可先重跑预览。');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { runMember(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
