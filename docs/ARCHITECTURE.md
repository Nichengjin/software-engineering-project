# 架构总览

这份文档描述仓库顶层结构。技术栈已于 2026-09-22 确定；2026-10-05 US-026 形成 [总体设计](design-docs/system-design.md)、[HTTP／DTO 契约](design-docs/api-contract.md) 和 [9 张原生 UML 图](design-docs/design-models.md)。US-027 与业务模块已形成实现候选，实际自测见 [执行计划](exec-plans/active/2026-10-05-delivery-execution.md)，集中主线合入进度见 [协作记录](exec-plans/active/2026-10-05-collaboration-history.md)；团队评审、独立验收与发布仍未完成。

## 已确定的技术栈

- 前端：React + TypeScript + Vite + TanStack Router，采用单页应用；不使用 Next.js，当前不采用 TanStack Start。
- 后端：Hono，使用 TypeScript。
- 数据访问与存储：Prisma + PostgreSQL。
- 建模工具：StarUML。

决定的依据、边界与后果见 [ADR-001](design-docs/adr/ADR-001-technology-stack.md)、[ADR-002](design-docs/adr/ADR-002-single-instance-consistency.md)。运行选择 Node22 LTS、npm workspaces、Prisma6、PostgreSQL15，一个 API 进程（gate＋数据库锁／事务），独立 HTTP 模拟与文件状态；持久化 session 和同事务 outbox 60 秒重试，明确不支持多实例。本机500／2000用户实测及局限见 [测试报告](TEST_REPORT.md)，不视为部署容量认证。精确依赖版本由底座锁定。[OOA v0.3](design-docs/object-oriented-analysis.md) 待团队评审；分析类不逐一映射数据库表或模块。

## 当前仓库结构

- `apps/api/`：Hono 认证、业务事务、准入、目录同步与计费后台任务；生产入口托管已构建 SPA。
- `apps/web/`：React／TanStack Router 三角色页面，使用同源 `/api`。
- `apps/simulators/`：独立 HTTP 目录／计费模拟，文件持久化与故障控制。
- `packages/contracts/`、`packages/db/`：Zod DTO／枚举，以及 Prisma schema／迁移／虚构 seed。
- 根 `compose.yaml`、`.agents/setup`、`.amp/services.yaml`：本地 PostgreSQL、orb 初始化与监督运行。
- `scripts/`：仓库级自动化脚本，供人和 Agent 直接调用。
- `tests/acceptance/`、`tests/e2e/`、`tests/load/`：随机独立数据库验收、有限Chrome端到端与负载脚本；不修改产品业务规则，命令见 [测试策略](TESTING.md)。
- `docs/`：仓库知识库，也是本地规则和上下文的正式来源。

实现目录已经收口：`apps/api`／`apps/web`／`apps/simulators`、`packages/db`／`packages/contracts`，workspace 包名分别为 `@wylie/api`／`@wylie/web`／`@wylie/simulators`／`@wylie/db`／`@wylie/contracts`。API 3000、模拟 3001、Vite 5173 同源 `/api` 代理；部署只暴露 SPA/API 入口。web／simulators 不依赖 db，API 通过 db 的 Prisma client 和 contracts DTO 工作。字段约束、目录权威与恢复协议以总体设计及 API 为准。

## 边界建议

- 业务逻辑优先沉淀到可复用包里，不要一开始就散落在各个 app 中。
- 基础设施和运行编排要显式版本化，不要藏在手工操作里。
- 避免隐式跨包耦合；一旦仓库成形，就把允许的依赖方向写清楚。
- 只要架构有变化，就同步更新这份文档。

## 后续需要补齐的内容

- US-026：团队走查，契约或实现变更同步源模型与导出。
- 冯海伦按 [测试计划](TEST_PLAN.md) 独立验收；性能、Windows／Edge、长时间可靠性不从开发自测推断。
- PR、远程 CI、团队评审、发布与独立环境复现；当前运行／测试命令见 [DEVELOPMENT](DEVELOPMENT.md) 和 [TESTING](TESTING.md)。
