# 测试策略

迭代增量模型成立的前提是每个增量都能被验证。项目使用 Vitest 与真实 PostgreSQL 15；具体环境见 [开发说明](DEVELOPMENT.md)。底座测试不替代业务 AC 验收与独立测试报告。

## 测试分层

| 层级 | 目的 | 触发时机 | 比例目标 |
| --- | --- | --- | --- |
| 单元测试 | 验证单个函数、类或模块的行为 | 每次 PR，本地与 CI | 占多数 |
| 集成测试 | 验证模块之间、与数据库或外部服务之间的协作 | 每次 PR，CI | 中等 |
| 端到端测试 | 从用户视角验证完整路径 | 每个迭代评审前，至少覆盖主流程 | 少量 |
| 手工验证 | 自动化暂时覆盖不到的场景 | 迭代评审 | 逐步替换为自动化 |

## 必须遵守的规则

- 每个用户故事的每条验收标准，至少对应一条自动化测试或一条有记录的手工验证。
- 修 bug 必须先补一条能复现该 bug 的测试，再改代码。
- 新增或修改的代码，测试覆盖率不能低于改动前。覆盖率门禁的具体数值在接入技术栈时写进 `scripts/ci.sh`。
- 测试要能在本地一条命令跑完，并且和 CI 用同一条命令。
- 不稳定的测试要么修好，要么显式标记并记入 `docs/exec-plans/tech-debt-tracker.md`，不能静默跳过。

## 命名与位置

- 测试文件和被测代码放在相邻或平行的目录，用统一后缀或前缀标识。
- 测试用例名要能读出"在什么条件下、期望什么结果"。
- 端到端测试按用户故事编号分组，方便在追溯矩阵里引用。

## 当前项目的测试命令

先 `npm ci`、`npm run db:generate`，启动独立 PostgreSQL 15，配置 ignored `.env` 中的 `TEST_DATABASE_URL`，再 `npm run db:migrate:test`。

- 单元测试：`npm run test:unit`。
- 真实 PostgreSQL 集成测试：`npm run test:integration`；全量测试 `npm test`。
- 类型检查：`npm run typecheck`，包含 seed／fixture／tests；生产构建：`npm run build`。
- 完整门禁：`make ci` 保留仓库检查并运行 generate、test migrations、typecheck、全量 test、build。
- 浏览器端到端与覆盖率报告尚未接入底座：由业务／独立测试阶段补齐；当前没有覆盖率百分比门禁，不声称已达覆盖率指标。

`TEST_DATABASE_URL` 必须显式提供、数据库名以 `_test` 结尾，且不能与 `DATABASE_URL` 的数据库名相同（保守防止 DNS／loopback 别名绕过）。集成连接、SQL 执行或迁移失败直接失败，不能因无 PG／无 Docker 静默 skip。测试不 reset 任意库：大多数用回滚事务，跨连接竞争用随机生成的单个身份并清理该身份，不 truncate 非测试数据。seed 集成复验只创建随机命名的全新 `_test` 数据库、迁移／seed 两遍并清理自己创建的库和凭据文件，需要测试角色具有 CREATEDB 权限；本地演示角色与 CI 的临时 postgres 均满足此条件。

底座测试位置：`packages/contracts/src/contracts.test.ts`（严格字段、日期／分钟边界、十进制、safe version、fixture 引用）、`scripts/database-url.test.ts`（独立测试 URL）、`packages/db/src/*.integration.test.ts`（真 PG15、回滚、跨角色 SSN 并发、墓碑、历史／有效注册、不可变 outbox、nullable 通知去重、登录审计后人员删除、随机 seed 密码逐一 scrypt 校验与 600 权限／重跑不变／关闭账单）。字段结构通过不表示 Hono 业务权限、关闭 gate、容量交易或性能已通过；这些应由 API／E2E 验证。

## 本轮交接给独立测试

2026-10-05 合并候选在 Node22.23.3／npm10.9.9 和 orb Node26 均通过 `make ci`：10 文件／108 tests（底座 23、API 36、模拟 41、前端 8）、strict typecheck、全部 app build。API 测试位于 `apps/api/test`，含真实 PG 事务及外部 HTTP 故障；统筹另跑三角色真实浏览器主链路，证据与局限见 [history](histories/2026-10/20261005-0312-system-design.md)。这不是远程 GitHub CI 或正式测试报告。

冯海伦从 [测试计划（含第 5 节 NFR 场景）](TEST_PLAN.md) 与 [64 条 AC 用例](testing/acceptance-cases.md) 开始，按 [开发说明](DEVELOPMENT.md) 在独立空数据库与模拟状态启动，逐项登记实际结果。开发自测不改变这些用例的“未执行”状态；性能、可用性、Windows／Edge、完整五秒传播和独立环境复现均待测试。
