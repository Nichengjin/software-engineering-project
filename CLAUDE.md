<system-reminder>必须先阅读 AGENTS.md。</system-reminder>

# 给 Claude Code 的补充说明

`AGENTS.md` 是唯一入口，规则都在 `docs/` 里，这里只放 Claude Code 在这个仓库里最容易踩的点。

## 开工前

- 先读 `AGENTS.md`，再按它的路由读 `docs/REPO_COLLAB_GUIDE.md` 和 `docs/ITERATION_GUIDE.md`。
- 确认任务对应的需求编号（`US-xxx` / `BUG-xxx`）和迭代编号（`IT-xx`）。用户没给就先问，或者在 `docs/product-specs/backlog.md` 加一行再开始。
- 跨迭代、高风险或多人协作的任务，先用 `make new-plan SLUG=<slug>` 建 execution plan，再改代码。

## 改代码时

- 分支命名 `<type>/<需求编号>-<slug>`，提交信息遵循 Conventional Commits，见 `docs/GIT_WORKFLOW.md`。
- 修 bug 先补能复现的测试，再改实现，见 `docs/TESTING.md`。
- 行为变化涉及的文档在同一轮里改掉，不要留到下一轮。
- 新增 GitHub Action 必须 pin 到 commit SHA。

## 收尾时

- 跑 `make ci`，失败就修到通过，不要跳过。
- 对照 `CONTRIBUTING.md` 的完成定义逐项检查：history、追溯矩阵、release note、backlog 状态。
- 用 `make new-history SLUG=<slug>` 记录本次变更，脱敏，不写本地路径和密钥。
- 纯问答、调研类任务不用记 history。
