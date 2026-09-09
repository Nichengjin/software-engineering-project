# 让模板对齐迭代增量 / 敏捷 + 持续交付流程

## 目标

在不绑定具体技术栈的前提下，把模板从"Agent 协作骨架"补齐为一套可以被软件工程课程检验的迭代增量开发流程：有迭代节奏、有从需求到发布的可追溯链、有明确的完成定义和测试策略，并让发布流水线由 tag 事件驱动。

## 范围

- 包含：
  - 新增迭代目录、迭代模板与迭代总览。
  - 新增产品待办列表、用户故事模板与需求追溯矩阵。
  - 新增测试策略、Git 工作流（分支、提交、版本号）文档。
  - 新增架构决策记录（ADR）模板。
  - 在 `CONTRIBUTING.md` 中单列完成定义（Definition of Done）。
  - release 流水线改为 `v*` tag 推送自动触发，保留手动触发。
  - 新增 Dependabot 配置。
  - 新增 `make new-iteration` / `make new-spec` / `make new-adr` 脚本。
  - 把新增的必备文件加入 `scripts/check-docs.sh` 和 `scripts/check-repo-hygiene.sh`。
  - 更新 `AGENTS.md`、`CLAUDE.md`、`README.md`，写清团队成员的工作流程。
- 不包含：
  - 接入具体语言的 lint、单元测试和覆盖率门禁（等技术栈确定）。
  - 自动部署 job 与容器镜像发布。
  - 过程度量（速度、DORA 指标）的采集自动化。
  - Issue 模板改为面向产品的用户故事 / 缺陷 / 任务三类。

## 背景

- 相关文档：`docs/REPO_COLLAB_GUIDE.md`、`docs/PLANS_GUIDE.md`、`docs/CICD.md`、`CONTRIBUTING.md`
- 相关代码路径：`scripts/`、`.github/workflows/`、`Makefile`
- 已知约束：
  - `AGENTS.md` 只做路由，规则要落到 `docs/`。
  - 每新增一份必备文档，要同步加入机械检查。
  - 所有 GitHub Action 必须 pin 到 commit SHA。

## 风险

- 风险：文档数量增多，团队成员不知道从哪开始读。
  缓解方式：`README.md` 提供一条"从需求到发布"的主线，`AGENTS.md` 只按场景路由。
- 风险：流程要求过重，课设周期内执行不下去。
  缓解方式：迭代周期短（1 到 2 周），单人小改动允许跳过 execution plan，只要求 PR 关联需求编号。
- 风险：tag 推送自动发布导致误发。
  缓解方式：只响应 `v*` 格式 tag，并要求 tag 只由 release 负责人在 `main` 上打。

## 里程碑

1. 调研与方案收敛：确认现有模板最接近迭代增量模型，列出缺口。
2. 分阶段实现：先补流程文档与模板，再改流水线和脚本，最后改入口文档。
3. 验证、交付与收尾：`make ci` 通过，补 history 与 release note，归档本 plan。

## 验证方式

- 命令：`make ci`
- 手工检查：`AGENTS.md`、`README.md` 中引用的文件全部存在；新脚本能在空目录下生成文件。
- 观测检查：无（本轮不涉及运行时）。

## 进度记录

- [x] 确认范围和约束。
- [x] 新增迭代、待办、用户故事、追溯矩阵、测试、Git 工作流、ADR 文档与模板。
- [x] 更新 `CONTRIBUTING.md`、PR 模板、`Makefile`、脚本与检查项。
- [x] release 流水线改为 tag 触发，新增 Dependabot。
- [x] 更新 `AGENTS.md`、`CLAUDE.md`、`README.md`。
- [x] `make ci` 通过，补 history 与 release note。

## 决策记录

- 2026-09-09：选择"迭代增量 + 敏捷 + 持续交付"而不是瀑布作为模板的目标流程，因为现有模板已具备活文档、小 PR、常驻 CI 等特征，补齐迭代节奏和追溯链的成本最低。
- 2026-09-09：需求编号采用 `US-xxx`（用户故事）、`BUG-xxx`（缺陷）、`ADR-xxx`（架构决策）、`IT-xx`（迭代）四类前缀，编号在各自索引文件里单调递增，不复用。
- 2026-09-09：execution plan 只对跨迭代、高风险或多人协作的任务强制要求；普通用户故事直接走 spec 加 PR，避免流程过重。
