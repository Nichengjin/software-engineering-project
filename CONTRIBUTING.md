# 参与协作

这个仓库是为 Agent-first 开发准备的，但这些规则对人和 Agent 都一样适用。开发流程采用迭代增量模型，详见 `docs/ITERATION_GUIDE.md`。

## 基本协作方式

- 从 `AGENTS.md` 开始，再按任务类型去读对应文档。
- 所有工作都从 `docs/product-specs/backlog.md` 里的一条需求出发，没有编号的需求先补编号再动手。
- 仓库级知识要落在版本化文件里，不要只存在聊天记录、口头同步或工单评论里。
- 如果行为变了，就一起更新代码、文档、测试和 release/history 记录。
- 遇到跨迭代、风险高、多人协作的任务，先在 `docs/exec-plans/active/` 下建 execution plan。
- 影响架构、协议、数据模型或关键依赖的决定，写一份 ADR 到 `docs/design-docs/adr/`。

## 分支与提交

按 `docs/GIT_WORKFLOW.md` 执行：主干开发，新任务用 `<type>/<member>/<需求编号>-<slug>` 命名分支，Conventional Commits 提交信息，通过 PR 使用保留原提交的 merge commit 合入 `main`，不使用 squash／rebase merge。成员拥有各自的短期任务分支，不设长期个人分支；旧格式分支保留。

## 完成定义（Definition of Done）

一个用户故事或缺陷只有全部满足下面的条件才算完成，迭代评审只统计满足完成定义的条目：

1. 代码已通过 PR 合入 `main`，PR 标题带需求编号。
2. `make ci` 在 CI 上通过。
3. 每条验收标准都有对应的自动化测试，或有记录的手工验证结果。
4. 行为变化涉及的文档已在同一 PR 中同步更新。
5. `docs/histories/` 中有对应的 history 记录。
6. `docs/product-specs/traceability.md` 已补上或更新该需求的行。
7. 用户可感知的变化已写入 `docs/releases/feature-release-notes.md`。
8. `docs/product-specs/backlog.md` 中该条目状态已改为"完成"。

## 发起 Pull Request 之前

- 运行 `make ci`。
- 对照上面的完成定义逐项自查，并在 PR 模板里勾选。
- 确认示例、脚本、说明文档和当前实现一致。

## Review 默认要求

- 优先拆成范围清晰的小 PR，一个 PR 只做一件事。
- 评审者核对需求编号真实存在、验收标准有对应测试、文档已同步。
- 明确写出风险点、迁移影响和后续待办。
- 如果上下文复杂，直接链接对应 spec、plan、ADR 或 history，不要依赖评审者自己猜。
