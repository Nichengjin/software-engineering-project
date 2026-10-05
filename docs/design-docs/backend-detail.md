# Hono 后端实现与开发自测

- 范围：US-004—US-018、US-021—US-023 的后端，UC-01—UC-14，包含 P1 补选。
- 输入：[需求 v0.6](../REQUIREMENTS_ANALYSIS.md)、[总体设计](system-design.md)、[HTTP 契约](api-contract.md)、`packages/contracts` 和 `packages/db`。业务数据库是 PostgreSQL 15；没有以内存替代人员、课表、注册、关闭结果或账单。
- 状态：开发自测，不代替冯海伦独立验收、团队评审、浏览器验收、合并或发布。仓库追溯、history 与总体交付记录由统筹同步。

## 1. 模块与启动边界

`apps/api/src/app.ts` 导出 `createApplication` 和 `createApp`，注入 Prisma、外部客户端、配置、Clock、fault hooks 与脱敏 logger；创建应用不监听端口。`server.ts` 单独读取配置、取得领导锁、恢复数据库、启动后台任务和 HTTP。

| 路径 | 实际职责 |
| --- | --- |
| `auth/password.ts`、`auth/session.ts` | scrypt、数据库 session、Origin 与 CSRF、首次改密、会话撤销 |
| `runtime/context.ts`、`gate.ts` | 同一事务、人员复查、审计、数据库时钟、准入与 drain |
| `runtime/external.ts`、`start.ts` | 契约化 HTTP、专用连接领导锁、启动恢复、独立后台调度 |
| `modules/catalog/service.ts` | 外部权威读取、镜像同步、复查、通知、目录只读投影 |
| `modules/schedules/service.ts` | 保存／正式提交／删除、版本墓碑、注册历史与截止确认 |
| `modules/teaching/service.ts` | 授课整份替换、本人名册、上一完成学期逐格录分 |
| `modules/people/service.ts` | 全角色 SSN、序列编号、影响 token、状态与账户更新 |
| `modules/terms/close.ts` | 关闭 intent、drain、一轮调剂、同事务关闭与补选 |
| `modules/billing/service.ts` | 完整 immutable outbox、租约、重试、新版本替换 |
| `modules/imports/{xlsx,service}.ts` | ZIP 限额校验、真实 ExcelJS 解析、逐行独立事务 |
| `rules.ts`、`errors.ts` | 重复使用的纯规则和契约失败结果；没有通用 repository／泛型分层 |

API 使用 `API_PORT=3000`，外部模拟默认私有 `3001`，Vite 同源开发入口 `5173`。不从 portal 的通用 `PORT` 推导 API 端口。`PUBLIC_ORIGIN` 必须配置为浏览器实际入口的 Origin，portal HTTPS cookie 为 Secure；不能通过开放 CORS 绕过来源检查。生产模式 Hono 托管构建后的 SPA，未知 `/api/*` 始终 JSON 404，不进入 SPA fallback。

## 2. 安全与审计的持久化边界

密码编码为 `scrypt$16384$8$1$<16字节盐的hex>$<64字节派生值的hex>`。**派生时先将 hex 解码回原始盐字节**，与数据库 seed 一致；不能用 hex 文本本身作盐。独立 `scryptSync` 构造 seed 格式的回归测试曾复现错误再验证修复，而非只做 hash→verify 自循环。错误 hex 文本盐生成的开发账户不提供兼容分支。

随机 256 位 `sid` 只在 HttpOnly／SameSite cookie 中传输，数据库存 SHA-256 摘要与绝对 12 小时有效期。CSRF token 是 `HMAC-SHA256(CSRF_SIGNING_KEY, rawSid)`，数据库只存摘要；`GET /auth/me` 可以恢复相同 token，刷新或多标签不会彼此失效。改密轮换 session 和 token，并删除本账户旧 session。

认证每请求加载账户和人员状态；写事务再检查角色、人员状态与所有权。休学／毕业只能继续看本人成绩，离职／停用不能继续用已有 session；停用本身不退课，人员状态变化才清理未关闭学期。

成功业务审计与变更同事务；权限拒绝、参数失败和业务失败由错误处理器另写脱敏审计。错误响应含 requestId、code、issues，不包含 SQL、堆栈、提交密码、cookie 或完整 SSN。数据库不可用导致审计无法持久化时明确记录脱敏失败日志，不声称审计已保存。新人员初始密码仅在本次授权创建／导入响应一次性返回。

## 3. 并发、确认与关闭的决定

普通业务写事务先取全局 advisory transaction lock `710001`，再按稳定排序取学期 `hashtextextended(termId,710002)` 锁。容量、教授归属、SSN、版本和人员状态在同一事务确认；不拿数据库锁等外部 HTTP。这个选择偏向正确性，吞吐指标必须另外实测。

课表保存与注册分开；提交使用请求内整份选择，不隐式提交旧 saved。首次须 4+2，已提交后主选 1—4／备选 0—2；主选检查全部规则，备选只检查存在／开放与全部先修及格，不因额满、时间冲突或同课程不同班次拒绝。删除保留递增版本墓碑，清空首次时间；重建仍按首次提交处理。

确认点是事务末端的条件 `UPDATE Schedule`：生产用 PostgreSQL `clock_timestamp()`，测试用注入 Clock，两种都参与左闭右开窗口判断。此前已变更的注册、审计和新课表在时间条件失败时一起回滚。请求发起时间或事务开始时间不替代确认时间。

关闭 gate 在同步段先变 CLOSING，立即拒绝新写；已准入请求继续完成，但不能穿过自然截止。关闭协调器等待 drain 后才进入最终处理，不持有普通写锁等待 drain。

**关闭 intent 是普通全局锁规则的明确例外**：单独短事务更新 Term。否则一个已准入、停在确认屏障并持有全局锁的提交会挡住 intent／202，形成关闭与在途处理互等。最终关闭事务仍使用全局／学期锁。

删除无业务记录学生时，对 Term 按 id 顺序 `FOR UPDATE` 并检查数据库 closeState 与即时 gate，禁止关闭期间删除。关闭 intent 获得对应 Term 行锁后才读取本次学生集合；已通过删除检查的事务先完成再捕获集合。这样同时覆盖“gate 已关闭、intent 未提交”和“删除检查先通过、关闭随后发起”两个窗口。

关闭先取消无教授班次，然后按首次提交时间、学号升序只做一轮调剂，实时检查备选容量／先修／冲突／同课程，最后取消不足 3 人的班次。暂为 2 人的班次可以调剂补到 3；最终取消后不做第二轮。关闭抛弃未提交 saved 编辑，冻结目录与价格，为当次集合中每个学生生成包括 0 元在内的账单；关闭结果、注册和完整 outbox 同事务提交。

内部失败回滚最终事务，另一个匹配 attemptId 的恢复事务改回 OPEN；已经成功的在途提交保留。恢复事务失败则不 ready，不只在内存擅自开放。启动看到 CLOSING 恢复 OPEN 并记录中断，看到 CLOSED 不重复调剂或生成账单。

## 4. 目录同步与计费调度互不等待

目录 GET 只读取权威 HTTP 和本地业务投影，不同步修改课表。外部 revision 尚未镜像时返回 CATALOG_CHANGED，后台每秒同步后可重试。网络错误／坏 payload 是 CATALOG_UNAVAILABLE，不能冒充空 offerings；真正完整空集合才表示全部删除。每学期同步队列避免旧响应覆盖新快照；删除保留 tombstone，变更冲突／先修只通知并保留注册，下一次提交重新检查。

目录和计费用独立每秒调度，分别限制重叠。计费一轮最多读取 50 个 due 记录，最多 8 个 HTTP 并发，每批等待已启动任务全部结束；5 秒计费超时不会挡目录下一轮。开发测试在 8 个账单发送一直被屏障阻塞时修改目录，实际后台仍在 5 秒内持久化新 revision。

账单按全部学分之和乘冻结每学分单价，最后一次按元保留两位、half-up；内部用 BigInt 百分单位。例如 3.50×125.55 为 439.43，不逐班舍入再相加。

发送前 CAS claim，15 秒 lease，attempts 与下一次恢复时间落库；HTTP 不在业务事务内。失败记录 failureTime＋60 秒为 nextAttemptAt，后台只发送已到期记录。重启恢复过期 IN_FLIGHT，保留 businessId 与 due 时间；接收成功但本地确认前中断仍可重发，外部按稳定业务标识去重。新版本账单新建完整 payload 并将旧版标 SUPERSEDED，旧确认不能覆盖新状态；后端同时校验 ack 的标识、版本和 latestVersion，不把任意 2xx 当成功。积压时的额外调度延迟与大规模吞吐仍须负载测试。

## 5. 单实例约束不是部署口头约定

`startRuntime` 用专用 pg session 连接取得 advisory leader lock `710000`，第二个 API 无法取得则拒绝启动。失锁连接异常立即不 ready，并由生产 server 退出进程；没有 cluster／横向副本兼容分支。正常关闭先停止准入与后台定时器、drain、等待任务，再释放领导连接。实测覆盖第二实例拒绝和正常停止后下一实例重新取得锁。

## 6. 导入、人员与成绩

ZIP 在交给 ExcelJS 前检查成员、路径、加密、宏／外部链接及有界解压，限制压缩 5 MiB、展开 20 MiB、5000 行／50 列；multipart 入口限额 6 MiB。表头严格，公式、链接与数值编号按实际 Excel 行号拒绝，文本保留前导零。

每有效行独立事务创建人员、PersonIdentity 和账户，遵守全角色 SSN 延迟约束。重复行跳过，坏行不撤销已有成功行；只授权导入上线前历史成绩、不覆盖已有成绩。人员状态影响 token 绑定人员版本、规范化 patch、业务版本／集合、gate 和 5 分钟到期时间，写事务重算，不能只用 confirmed 绕过。

教授授课请求全部检查后整体替换，并保留取消历史。录分先验证本人班次、上一已完成且不早于上线学期、所有学生均在有效名册；任一越权学生令整请求拒绝。通过权限后合法格保存，空值不变，Z 等非法格逐格拒绝，I 与 null 区分；10 格中空值／Z 的精确 8 成功结果有开发断言。

## 7. 实测命令、覆盖与尚未验收事项

环境：本 orb 的 PostgreSQL 15、Node 22.23.3、Prisma 6.19.3、Vitest 4.1.11。测试不使用 mock Prisma：在明确 `_test` 数据库创建随机隔离 schema、实际应用四个迁移，每测试重置该 schema，结束删除；不清理共享业务 schema。缺 TEST_DATABASE_URL 明确失败，不静默 skip；无数据库时只运行排除 integration 的 unit 命令。

```sh
npm run db:generate
npm run build -w @wylie/contracts -w @wylie/db -w @wylie/api
node node_modules/typescript/bin/tsc -p tsconfig.json
node --env-file=.env node_modules/vitest/vitest.mjs run apps/api/test --reporter=verbose
```

开发测试文件为 `apps/api/test/rules.test.ts`、`backend.integration.test.ts`。最终预期并已复跑结果为 **36 项：7 单元／29 实际 PostgreSQL 集成**，其中一项启动独立模拟器真实 HTTP 并重启模拟器与应用，验证 drop-after-accept、去重、新版本覆盖。原始字节盐回归先失败、修复后通过。类型检查覆盖测试文件，API 编译通过。

| 验收范围 | 开发证据 |
| --- | --- |
| AC-01—08、10—18、43—48、50—51、56、63—64 | session／CSRF／改密、目录字段、保存注册分离、全部先修、真实最后名额并发、墓碑、条件确认、教授原子争抢与资格 |
| AC-19—27、37—42、52—53 | 上一完成学期、逐格与整份越权、跨角色写路径组合、脱敏审计、SSN 与 CRUD、状态清理／关闭历史保留 |
| AC-28—36、54—55 | 关闭准入屏障、drain、时间／学号排序、一轮调剂、2→3、回滚、零元、outbox 租约与真实 HTTP 重启 |
| AC-57—62 | 补选第十位与四门上限、失败不出新账单、冻结账单快照、真实 xlsx 混合行／历史不覆盖／资格去重 |

上表表示后端开发断言，不是整条浏览器验收自动通过。**AC-09 的 5 秒页面额满提示、AC-49 的另一页面 5 秒刷新尚须浏览器计时**；同样 AC-03 等呈现、确认取消提示与导入交付体验由前端／独立验收验证。NFR-01—05、07—10 尚未在本任务证明全部达标：没有 500／2000 同时用户负载、120 秒比例、7×24 可用性、Windows Chrome／Edge、独立环境整体验收或完整端到端延迟报告。NFR-06 的核心原子／只读约束有真实数据库故障和并发证据。

依赖审计在最新底座锁上报告 Prisma／deepmerge-ts 路径 3 high、ExcelJS／uuid 路径 2 moderate，已通知底座和统筹处理；本任务未擅自升级或降级根锁，也不声称供应链无风险。业务实现无环境能力阻塞；最终仍需统筹集成、独立验收、文档追溯与交付流程。
