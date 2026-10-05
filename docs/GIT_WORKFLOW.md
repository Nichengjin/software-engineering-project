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

2026-10-05 后续授权执行：远程 `main` 已从现有分析基线建立，18 条任务分支已推送，PR #6—23 均指向 main。初次 API 修改设置返回 403；用户手动调整后已读回确认：默认 main，只允许 merge commit。真实 PR 与工作包映射见上述计划第 8 节，合入状态以实时 GitHub `mergedAt` 和执行记录为准。

最新决定是成员本轮无法参与，由组长集中处理**现有** #6—23，严格按 #6、#7……#23 的数字顺序使用 merge commit。不得为本轮创建替代／成员 PR，不得借成员姓名伪造认证、审批、独立开发或测试。保留已有提交 Author、Committer、日期与 AI 来源。

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

本节为历史可选机制，当前停用。2026-10-05 曾准备 [member-pr.mjs](../scripts/member-pr.mjs)，供原 PR 创建者不是任务成员时，由成员本人认证后创建指向相同提交的替代 Draft PR，再关联并关闭原 PR。它只服务这批**原 PR 的一次性交接**，不提交代码、不审批、不合并，也不是未来功能开发的自动化工具。其模拟测试为 `npm test -- scripts/member-pr.test.ts`。

该方案已被最新决定取代：本轮组长直接集中处理现有 #6—23，任何人都不得运行 `--apply`、创建 `-member-pr` 分支或重复 PR。保留本节只是如实记录曾存在的可选机制，不是当前操作清单。

未来实际新工作必须从最新 `main` 新建正常任务分支，先有需求与迭代，再做真实修改、验证、history、commit 和 push，最后由本人认证账号创建 Draft PR。没有新任务不造提交或 PR；姓名、Git Author 或分工表不能替代 GitHub 登录和人类许可。新人入口及 PowerShell 示例见 [成员指南](member-guides/README.md)。冯海伦的独立验收仍须实际执行并记录，不能由脚本或开发自测替代。

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
