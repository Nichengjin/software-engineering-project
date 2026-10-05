# Wylie College 学生选课系统

软件工程课程设计，基于 [`harness-template`](https://github.com/iFurySt/harness-template) 的 Agent-first 协作流程。

## 简介

React／Hono／Prisma／PostgreSQL 选课系统，面向学生、教授、教务员三类角色；课程目录和计费通过独立 HTTP 模拟服务提供。包括保存与提交课表、授课与成绩、人员与 xlsx 导入、关闭调剂、计费重试和关闭后补选。

当前是本地实现候选，未合入／发布，不能当作独立验收已通过。实际检查和未完成项见 [执行计划](docs/exec-plans/active/2026-10-05-delivery-execution.md)；冯海伦接手的 [测试计划](docs/TEST_PLAN.md) 与 [64 条验收用例](docs/testing/acceptance-cases.md) 独立记录执行结果。

## 快速开始

需要 Node.js 22.12+、npm 10 与 PostgreSQL 15。Docker Compose／无 Docker orb 两种路径、迁移及私密凭据说明见 [开发运行指南](docs/DEVELOPMENT.md)。本地 Docker 环境首次启动：

```sh
npm ci
npm run env:local
docker compose up -d --wait postgres
docker compose exec postgres createdb -U wylie wylie_test  # 仅第一次
npm run db:generate
npm run db:migrate
npm run db:migrate:test
npm run db:seed
npm run dev
```

orb 使用 `.agents/setup` 和 `amp orb services ensure` 启动监督服务，再运行迁移／seed；访问工具返回的 portal，不使用 sandbox 直连地址。

seed 生成 14 学生、4 教授、1 教务的虚构数据，独立随机密码写入 ignored `.local/demo-credentials.json`（600）；首次登录需改密。不要提交或分享凭据文件。重复 seed 保留数据／密码，不自动 reset。演示窗口具有真实日期，过期后由教务修改，不能靠前端改时钟。API 仅支持单实例。

验证用 `make ci`（文档卫生、生成 client、测试库迁移、strict typecheck、全量 Vitest、生产 build）。必须提供独立 `TEST_DATABASE_URL`，名称以 `_test` 结尾。模拟故障／持久化说明见 [SIMULATORS](docs/SIMULATORS.md)。性能、Windows Edge 和独立验收未实测的项目不得据构建通过标为达标。

## 团队工作流程

当前选课系统课设的六人分工、进度、交付物与风险安排见 [项目开发计划](docs/PROJECT_DEVELOPMENT_PLAN.md)（v0.4，待团队评审）；每人负责的需求、评审人和提交作者规则见 [团队分工](docs/TEAM_ROLES.md)。

具体功能、业务规则、权限、验收标准与待确认事项见 [需求分析文档](docs/REQUIREMENTS_ANALYSIS.md)（v0.6，待团队评审）。

已定技术栈为 React + TypeScript + Vite + TanStack Router、Hono、Prisma、PostgreSQL，使用 StarUML 建模；不使用 Next.js，当前不采用 TanStack Start。选型依据见 [ADR-001](docs/design-docs/adr/ADR-001-technology-stack.md)。

按课程流程排出的完整时间轴与打勾清单见 [项目北极星](docs/NORTH_STAR.md)（修订排期待团队确认）。

用于校准课程流程与建模方法的 [课件文字版与索引](docs/lecture-notes/README.md) 已导入，包含 58 份分章节 TXT、合并全文及来源校验记录。

下面是一条需求从提出到发布的完整路径，也是每个团队成员默认要走的流程。细则都在对应文档里，这里只画主线。

### 1. 需求进待办

- 所有想做的功能和要修的缺陷都先写进 `docs/product-specs/backlog.md`，拿到 `US-xxx` 或 `BUG-xxx` 编号。
- 需要详细描述时运行 `make new-spec SLUG=<slug>`，按用户故事加 Given / When / Then 验收标准的格式写。
- 产品负责人在迭代计划前维护优先级排序。

### 2. 迭代计划

- 迭代周期固定为 1 到 2 周。运行 `make new-iteration SLUG=<slug>` 建迭代文件，并在 `docs/iterations/README.md` 登记。
- 从待办顶端挑选故事，写一句话迭代目标，把故事拆成 1 到 2 天能合入的任务。
- 跨迭代、高风险或多人协作的任务额外用 `make new-plan SLUG=<slug>` 建 execution plan。影响架构的决定用 `make new-adr SLUG=<slug>` 写 ADR。

### 3. 开发与提交

- 从已包含前置依赖的 `main` 拉任务分支，命名 `<type>/<member>/<需求编号>-<slug>`，例如 `feat/haoyu/us-006-student`；各成员可以有多条短期分支，见 [提交与分支计划](docs/exec-plans/active/2026-10-05-collaboration-history.md)。
- 提交信息遵循 Conventional Commits，正文写 `Refs: US-001`。
- 修 bug 先补一条能复现的测试再改代码。
- 提 PR 前本地运行 `make ci`。

### 4. Pull Request 与评审

- 一个 PR 只做一件事，标题带需求编号。
- 按 PR 模板逐项勾选完成定义：CI 通过、验收标准有测试、文档同步、history 已记、追溯矩阵已更新、release note 已写、待办状态已改。
- 至少一人评审，CI 绿灯后使用 merge commit 合入，保留原提交；之后可删除分支引用，不压缩提交历史。本地合并图不能代替平台 PR／评审记录。

### 5. 迭代评审与发布

- 迭代结束基于 `main` 演示，逐条对照验收标准，未通过的退回待办。
- 通过后由 release 负责人打 `vX.Y.Z` tag 并推送，`release.yml` 自动产出制品、SBOM、provenance 和 GitHub Release。
- 回顾三个问题：做得好的、做得不好的、下个迭代改一件事。需要改流程的结论直接改进 `docs/`。

### 每天要遵守的几条

- 没有需求编号不开工，没有测试不合入，没有更新文档不算完成。
- 重要信息只存在聊天记录里等于不存在，落到 `docs/`。
- `main` 随时可发布，不往 `main` 直接推送。

## 文档地图

| 想知道 | 看这里 |
| --- | --- |
| 入口与路由 | `AGENTS.md` |
| 迭代怎么跑 | `docs/ITERATION_GUIDE.md`、`docs/iterations/` |
| 需求怎么写、怎么追溯 | `docs/product-specs/` |
| 分支、提交、版本号 | `docs/GIT_WORKFLOW.md` |
| 完成定义与 PR 要求 | `CONTRIBUTING.md` |
| 测试策略 | `docs/TESTING.md` |
| CI/CD 与发布 | `docs/CICD.md` |
| 架构与决策 | `docs/ARCHITECTURE.md`、`docs/design-docs/adr/` |
| 大任务计划 | `docs/PLANS_GUIDE.md`、`docs/exec-plans/` |
| 变更历史 | `docs/HISTORY_GUIDE.md`、`docs/histories/` |
| 发布记录 | `docs/releases/` |
| 安全与供应链 | `docs/SECURITY.md`、`docs/SUPPLY_CHAIN_SECURITY.md` |

## 常用命令

```sh
make ci                          # 本地跑与 CI 相同的门禁
make new-spec SLUG=<slug>        # 新建用户故事
make new-iteration SLUG=<slug>   # 新建迭代
make new-plan SLUG=<slug>        # 新建 execution plan
make new-adr SLUG=<slug>         # 新建架构决策记录
make new-history SLUG=<slug>     # 新建变更历史
```

## 许可证

[MIT](LICENSE)

## 备注

这套方法主要来自我们自己的持续实践和整理，同时也吸收了 OpenAI 在 [harness engineering 文章](https://openai.com/index/harness-engineering/) 中的一部分思路，最后汇总成了这个模板。
