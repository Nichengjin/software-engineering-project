# Git 工作流

这份文档定义分支、提交、评审、版本号和发布的默认约定。目标是让 `main` 随时可发布，让每一次变更都能追溯到需求。

## 分支模型

采用主干开发加短生命周期功能分支：

- `main` 是唯一长期分支，受保护，只能通过 PR 合入，必须 CI 通过且至少一人评审。
- 新任务从包含其前置依赖的最新 `main` 拉分支，命名为 `<type>/<member>/<需求编号>-<slug>`，例如 `feat/haoyu/us-006-student`。成员标识见 [团队分工](TEAM_ROLES.md)；现有旧格式分支保留，不为改名重写历史。
- 集中准备已有候选时可使用堆叠分支：从尚未合入的前置任务 tip 起分支，必要时合并多个前置，保留共同祖先；不必等前置 PR 合并才创建提交。正式 PR 按依赖分批发起，前置有审阅修改时同步并复验后续分支。
- 每条分支对应一个任务／PR，成员可以先后或同时拥有多条任务分支；不设六条长期个人分支，也不限制一个 PR 只能有一位实际作者。
- 分支生命周期尽量控制在 1 到 2 天；合入后可删除分支引用，merge commit 及其可达的原提交仍保留。课程材料记录原分支名和合并提交，不依赖永久保留分支指针。
- 不设 `develop`、`release` 等长期分支。需要修线上问题时同样从 `main` 拉 `fix/` 分支。

当前成果的 [提交与分支计划](exec-plans/active/2026-10-05-collaboration-history.md) 对应 US-002／IT-01，跨 IT-02—04 执行；其中编号是规划标识，不代表已创建的 GitHub PR。分支属主不自动等于每条提交作者。

2026-10-05 后续授权执行：远程 `main` 已从现有分析基线建立，18 条任务分支已推送，PR #6—23 均指向 main（首个待审，其余草稿）。初次 API 修改设置返回 403；用户手动调整后已读回确认：默认 main，只允许 merge commit。真实 PR 与工作包映射见上述计划第 8 节；尚无正式合入。成员替代 PR 使用下方脚本，由成员本人执行后登记新编号。

## 提交信息

遵循 Conventional Commits：

```text
<type>(<scope>): <一句话描述>

<可选的正文，说明为什么这么改>

Refs: US-001
```

- `type` 取值：`feat`、`fix`、`docs`、`test`、`refactor`、`chore`、`ci`。
- 提交信息的描述和正文全部用中文写，`type` 和 `scope` 保留英文关键字。
- 涉及需求的提交在正文或页脚写 `Refs: <需求编号>`。

## Pull Request

- 一个 PR 只做一件事，能在 15 分钟内看完。
- 标题格式与提交信息一致，并带需求编号，例如 `feat(auth): 支持邮箱注册 (US-001)`。
- 按 `.github/PULL_REQUEST_TEMPLATE.md` 填写，勾完"完成定义"里的每一项。
- 评审者核对：需求编号存在于 `docs/product-specs/backlog.md`，验收标准有对应测试，文档已同步。
- 使用 **Create a merge commit** 合入，保留分支内原提交，并产生一次有两个父节点的合并提交；不使用 squash merge、rebase merge 或仅 fast-forward。
- 协作分支需要同步主干时，合并最新 `main` 并处理真实冲突；不通过 rebase／强推改写他人正在使用的提交。没有变化时不制造空提交或额外合并。
- 合并提交信息使用 `chore(merge): 合入…… (US-xxx)`；有真实 PR 编号时再引用。普通提交仍分别保留需求编号、作者、说明与验证信息。

### GitHub 配置与本地合并的区别

仓库设置目标为：启用 merge commits、禁用 squash／rebase merge；若规则要求 linear history，需由管理员获授权后调整，否则无法接收 merge commit。2026-10-05 用户手动调整后已确认合并选项符合目标。未修改保护规则或成员权限，不能把合并选项已配置等同于所有分支保护已启用；仍要求真实 PR、检查和评审。

Git 本地可以用 `git merge --no-ff <branch>` 创建同样的合并拓扑，但没有 GitHub PR、审批或 Actions 记录。它只能作为本地集成／预演，不能填成已完成平台 PR，也不绕过正式合入要求。即使分支当时可以快进，`--no-ff` 也会保留合并节点；已合入且无新提交时不会凭空新增节点。

查看完整提交图用 `git log --graph --oneline --all`；只看主线集成节点用 `git log --first-parent --oneline main`。前者展示分支内工作，后者展示合入批次，两种提交数量不能混算为成员贡献。

## 成员脚本：本人创建替代 PR

关联 US-002／IT-01。共用 [member-pr.mjs](../scripts/member-pr.mjs)，用成员标识选择各自任务；无需复制六份逻辑。准备 Node.js 22.12+、Git 和近期版本 GitHub CLI `gh`，成员先接受本仓库 **Write** 协作者邀请，并以自己的账号登录 `gh auth login --hostname github.com`。Git 中的姓名／邮箱不能代替 GitHub 登录，也不需要把 token 或密码填进脚本。

脚本通过 GitHub API 创建指向已有提交的远程分支引用，等效于把相同提交推到新分支；不需要 npm install、数据库、压缩包，不操作本地 Git 工作区，不重新 commit 或更改 Git 身份。仅检查明确填写的 `--login` 与真实登录相同；姓名与 GitHub 账号的对应仍由成员和组长核对，不靠猜测邮箱。

### 第一次获取脚本与预览

在成员自己的电脑上打开终端；下例适用于 macOS／Linux／Windows PowerShell 或 Git Bash。使用一个尚不存在的新目录，避免干扰已有项目。脚本随 PR #23 分支提供，尚未进入 main，从下方分支获取：

```sh
gh repo clone Nichengjin/software-engineering-project wylie-handoff -- --branch ci/fanzhao/us-027-checks
```

进入新建的 `wylie-handoff` 目录后，按本人这一行运行。`YOUR_LOGIN` 必须替换为本人真实 GitHub 用户名，不是表里的成员标识：

| 成员 | 预览命令 | 当前任务／旧 PR |
| --- | --- | --- |
| 倪成锦 | `node scripts/member-pr.mjs nichengjin --login Nichengjin` | #6、8、10、13、14、20、22 已由本人账号创建，保留原 PR |
| 浩宇 | `node scripts/member-pr.mjs haoyu --login YOUR_LOGIN` | P03b #11、P05b #16 |
| 马喆 | `node scripts/member-pr.mjs mazhe --login YOUR_LOGIN` | P06 #15 |
| 冯海洋 | `node scripts/member-pr.mjs fenghaiyang --login YOUR_LOGIN` | P07a #17、P07b #18、P08c #21 |
| 范昭 | `node scripts/member-pr.mjs fanzhao --login YOUR_LOGIN` | P02a #7、P02c #9、P04a #12、P08b #19、P09a #23 |
| 冯海伦 | `node scripts/member-pr.mjs fenghailun` | 无待替换 PR，只提示独立验收安排；不伪造用例／报告 |

默认只发 GET 请求，不创建、关闭或修改任何远程对象。成员检查预览列出的任务与提交，再在同一命令后加 `--apply` 执行。可加 `--task P03b` 只处理一项；建议先处理一项核对后再批量。示例：

```sh
node scripts/member-pr.mjs haoyu --login YOUR_LOGIN --task P03b
node scripts/member-pr.mjs haoyu --login YOUR_LOGIN --task P03b --apply
```

### 执行效果、失败与后续修改

- 同一 head／base 不能同时创建两份开放 PR，脚本使用 `<原分支>-member-pr`，提交 SHA、作者、时间和依赖图保持不变。新 PR 由当前认证成员创建，始终为 **Draft**，复制原说明为历史附件并注明接手来源；不宣称本人已审核或独立开发。
- 顺序为：检查身份／权限／原 PR → 建接手引用 → 建新 PR → 读回核对作者、仓库、版本和标记 → 在旧 PR 留替代链接 → 关闭旧 PR。原 PR 不删除、原分支不删除，评论／审批／检查不迁移成新 PR 的通过记录。
- 默认最多替换所选成员的全部已准备任务；错误立即停止，已完成的任务保留。请求失败或响应丢失后先重跑预览，再用同一命令继续；已有同账号、同版本、同标记的新 PR 会复用，评论会去重，不重建。已有不同作者／提交／状态则停止人工核对，绝不强推。
- 执行期间不要让其他人修改、合并这些原分支或接手分支。脚本多次读回版本，但 GitHub 的创建／评论／关闭不是一个原子事务，不能保证阻止最后一次读取后的所有并发操作；发生变化时由组长协调。新 PR 已创建但关闭权限不足时，旧 PR 保持开放，组长核对替代链接后再处理。
- 各成员可以独立创建草稿，不必等待前置合入。合并仍按工作包依赖排序；关闭旧 PR **不等于前置已合入**，组长须更新 [任务索引](exec-plans/active/2026-10-05-collaboration-history.md#8-已创建的真实-pr-与远程限制) 和追溯矩阵。原 PR 的成员接手评论及新 PR 的“前置”链接用于找到替代编号。
- 脚本不自动拉取源码到其他目录、做业务测试、创建后续修改、审批、转为待审、合并或发布。接手后保留 `wylie-handoff` 作为脚本副本；需要修改代码时另开开发 clone，在其中执行 `gh pr checkout 新PR编号`，实际检查／修改／测试后按正常流程 commit、push。不要在脚本副本中 checkout 早期任务分支，否则该分支可能没有脚本。
- 冯海伦从 [测试计划](TEST_PLAN.md) 与 [开发说明](DEVELOPMENT.md) 开始独立执行，有真实用例／报告变更后再建自己的测试分支和 PR；当前脚本不提前创建未来 P10／P11 的空分支。

测试：`npm test -- scripts/member-pr.test.ts`，模拟 GitHub 写入、响应丢失与重跑；真实成员账号的写入流程须由成员运行，不能用组长账号代测其身份。现有 CI／依赖阻断并未因接手而解除，成员执行会正常触发新 PR 检查。

## 版本号与发布

- 遵循语义化版本 `vMAJOR.MINOR.PATCH`。
- 每个迭代评审通过后，由 release 负责人在 `main` 上打 tag。迭代交付新功能升 `MINOR`，只修缺陷升 `PATCH`，破坏兼容才升 `MAJOR`。
- 推送 `v*` tag 会自动触发 `.github/workflows/release.yml`，产出制品、SBOM、provenance 并创建 GitHub Release。
- 打 tag 前确认 `docs/releases/feature-release-notes.md` 已包含本次发布的内容。

```sh
git checkout main && git pull
git tag -a v0.2.0 -m "IT-02: 完成注册与登录"
git push origin v0.2.0
```

## 常用命令

```sh
git switch -c feat/haoyu/us-006-student main  # 前置依赖已合入、工作区干净时开始
make ci                                      # 提 PR 前本地跑门禁
make new-history SLUG=us-006-student          # 记录本次变更
```
