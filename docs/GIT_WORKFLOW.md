# Git 工作流

这份文档定义分支、提交、评审、版本号和发布的默认约定。目标是让 `main` 随时可发布，让每一次变更都能追溯到需求。

## 分支模型

采用主干开发加短生命周期功能分支：

- `main` 是唯一长期分支，受保护，只能通过 PR 合入，必须 CI 通过且至少一人评审。
- 每个任务从 `main` 拉一条分支，命名为 `<type>/<需求编号>-<slug>`，例如 `feat/us-001-register`、`fix/bug-003-login-timeout`、`docs/it-02-retro`。
- 分支生命周期尽量控制在 1 到 2 天，合入后立即删除。
- 不设 `develop`、`release` 等长期分支。需要修线上问题时同样从 `main` 拉 `fix/` 分支。

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
- 用 squash merge 合入，保持 `main` 上一个 PR 一个提交。

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
git checkout -b feat/us-001-register main   # 开始一个任务
make ci                                     # 提 PR 前本地跑门禁
make new-history SLUG=us-001-register       # 记录本次变更
```
