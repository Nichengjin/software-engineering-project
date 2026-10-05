# 需求追溯矩阵

这张表回答一个问题：每条需求从提出到发布，经过了哪些产物。每次 PR 合入后由 PR 作者补一行或更新一行。

## 追溯规则

- 一行一个需求编号（`US-xxx` 或 `BUG-xxx`）。
- PR 标题或描述里必须出现需求编号，评审者据此核对。
- 测试列填测试文件路径或测试用例名，没有自动化测试时填手工验证记录的位置。
- 发布列填包含该需求的 tag。
- “验收设计”只引用预期行为；“测试证据”才记录实际执行结果。初稿可先登记对应关系，未合入、未测试、未发布时明确保留待补状态。

## 矩阵

下表保留独立验收状态；开发自测已经执行的证据另见下一节，不把 Agent 自测记成冯海伦验收。

| 需求 | Spec | 迭代 | ADR / Plan | PR | 独立验收设计 | 独立验收／文档检查证据 | 发布 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| US-002 | [开发计划](../PROJECT_DEVELOPMENT_PLAN.md)、[团队分工](../TEAM_ROLES.md) | IT-01 | 同 Spec | 未创建 | 计划第 8 节团队评审 | 待评审 | 未发布 |
| US-003 | [需求分析](../REQUIREMENTS_ANALYSIS.md) | IT-01 | [开发计划](../PROJECT_DEVELOPMENT_PLAN.md) | 未创建 | 需求分析第 12.3 节文档验收 | 待评审 | 未发布 |
| US-019 | [选型记录](../design-docs/adr/ADR-001-technology-stack.md) | IT-01 | ADR-001 | 未创建 | ADR-001 文档验收条件，含 Router／Start 取舍 | [文档检查记录](../histories/2026-09/20260922-1420-technology-stack.md)；待合入 | 未发布 |
| US-020 | [课件文字与索引](../lecture-notes/README.md) | IT-01 | 无新增架构决定 | 未创建 | 课件索引中的 US-020 验收条件 | [资料校验记录](../histories/2026-09/20260922-1535-courseware-text.md)；待合入 | 未发布 |
| US-004 | [UC-01](../REQUIREMENTS_ANALYSIS.md#uc-01) | IT-02 | US-026／ADR-002／执行计划 | 未创建 | AC-01、AC-02、AC-43、AC-44 | 未执行 | 未发布 |
| US-005 | [UC-02](../REQUIREMENTS_ANALYSIS.md#uc-02) | IT-02 | US-026／ADR-002／执行计划 | 未创建 | AC-03、AC-04、AC-45、AC-46 | 未执行 | 未发布 |
| US-006 | [UC-03](../REQUIREMENTS_ANALYSIS.md#uc-03) | IT-03 | US-026／ADR-002／执行计划 | 未创建 | AC-05、AC-47、AC-48、AC-64 | 未执行 | 未发布 |
| US-007 | [UC-03](../REQUIREMENTS_ANALYSIS.md#uc-03) | IT-03 | US-026／ADR-002／执行计划 | 未创建 | AC-06 至 AC-10、AC-12、AC-13、AC-49、AC-50、AC-64 | 未执行 | 未发布 |
| US-008 | [UC-03](../REQUIREMENTS_ANALYSIS.md#uc-03) | IT-03 | US-026／ADR-002／执行计划 | 未创建 | AC-11、AC-12、AC-63 | 未执行 | 未发布 |
| US-009 | [UC-04](../REQUIREMENTS_ANALYSIS.md#uc-04) | IT-03 | US-026／ADR-002／执行计划 | 未创建 | AC-14 至 AC-16、AC-51 | 未执行 | 未发布 |
| US-010 | [UC-05](../REQUIREMENTS_ANALYSIS.md#uc-05) | IT-03 | US-026／ADR-002／执行计划 | 未创建 | AC-17、AC-18 | 未执行 | 未发布 |
| US-011 | [UC-06](../REQUIREMENTS_ANALYSIS.md#uc-06) | IT-03 | US-026／ADR-002／执行计划 | 未创建 | AC-19 至 AC-21 | 未执行 | 未发布 |
| US-012 | [UC-07](../REQUIREMENTS_ANALYSIS.md#uc-07) | IT-03 | US-026／ADR-002／执行计划 | 未创建 | AC-22、AC-23 | 未执行 | 未发布 |
| US-013 | [UC-08](../REQUIREMENTS_ANALYSIS.md#uc-08) | IT-03 | US-026／ADR-002／执行计划 | 未创建 | AC-24、AC-25、AC-52 | 未执行 | 未发布 |
| US-014 | [UC-09](../REQUIREMENTS_ANALYSIS.md#uc-09) | IT-03 | US-026／ADR-002／执行计划 | 未创建 | AC-26、AC-27、AC-53 | 未执行 | 未发布 |
| US-015 | [UC-10](../REQUIREMENTS_ANALYSIS.md#uc-10) | IT-03 | US-026／ADR-002／执行计划 | 未创建 | AC-28 至 AC-33、AC-54、AC-55 | 未执行 | 未发布 |
| US-016 | [UC-11](../REQUIREMENTS_ANALYSIS.md#uc-11) | IT-03 | US-026／ADR-002／执行计划 | 未创建 | AC-34 至 AC-36 | 未执行 | 未发布 |
| US-017 | [权限](../REQUIREMENTS_ANALYSIS.md#security) | IT-02；IT-03 验证 | US-026／ADR-002／执行计划 | 未创建 | AC-18、AC-37 至 AC-42 | 未执行 | 未发布 |
| US-018 | [非功能](../REQUIREMENTS_ANALYSIS.md#nfr) | IT-04；IT-03 准备 | US-026／执行计划 | 未创建 | NFR-01 至 NFR-10 的验证方法 | 未执行 | 未发布 |
| US-021 | [UC-12](../REQUIREMENTS_ANALYSIS.md#uc-12) | IT-02 | US-026／ADR-002／执行计划 | 未创建 | AC-56 | 未执行 | 未发布 |
| US-022 | [UC-13](../REQUIREMENTS_ANALYSIS.md#uc-13) | IT-03 | US-026／ADR-002／执行计划 | 未创建 | AC-57、AC-58、AC-62 | 未执行 | 未发布 |
| US-023 | [UC-14](../REQUIREMENTS_ANALYSIS.md#uc-14) | IT-02 | US-026／ADR-002／执行计划 | 未创建 | AC-59 至 AC-61 | 未执行 | 未发布 |
| US-024 | [面向对象分析](../design-docs/object-oriented-analysis.md) | IT-01 | 无新增技术设计决定 | 未创建 | 分析第 8—9 节走查及文档验收 | [模型与文档检查](../histories/2026-10/20261005-0108-oo-analysis.md)；团队评审与业务测试未执行 | 未发布 |
| US-025 | [项目北极星](../NORTH_STAR.md) | IT-01 | 用户授权后按 execution plan 同步开发计划；团队评审待办 | 未创建 | 北极星第 3 节真实授权／评审区分；第 4 节提交物清单与课程要求一致 | [文档检查记录](../histories/2026-10/20261005-0130-north-star-timeline.md)；团队评审未执行 | 未发布 |
| US-026 | [总体设计](../design-docs/system-design.md)、[API](../design-docs/api-contract.md) | IT-02 | [ADR-002](../design-docs/adr/ADR-002-single-instance-consistency.md)、[execution plan](../exec-plans/active/2026-10-05-delivery-execution.md) | 未创建 | UC-01—14、BR-01—17 契约与实现一致性；团队设计走查 | [9 图 CLI／GUI 验证](../design-docs/design-models.md) 已执行；团队评审待办 | 未发布 |
| US-027 | [IT-02](../iterations/IT-02-design-and-foundation.md)、总体设计第 1—3、8 节 | IT-02 | ADR-002、同上 plan | 未创建 | npm／Node22／Prisma6／Postgres15，真实迁移／seed／smoke，Clock／fault hooks 与命令 CI | 23 项底座自测及统筹集成已执行，独立环境验收待办 | 未发布 |

原 US-001 行中的 PR、测试路径及发布版本均为模板示例，已移除，不能作为本项目的交付证据；该编号仍在 backlog 中保留并标记已取消。

## 2026-10-05 开发自测与集成证据（不是独立验收）

本地 `make ci` 实际通过：10 文件、108 项测试、strict typecheck、全应用 build。[本轮 history](../histories/2026-10/20261005-0312-system-design.md) 记录真实浏览器／PG／HTTP 模拟联测、发现并修复的问题与限制。全部 PR／发布仍未创建。

| 需求 | 测试实现与证据 |
| --- | --- |
| US-004、017 | `apps/api/test/rules.test.ts`、`backend.integration.test.ts`：独立 seed 密码盐、持久化 session／CSRF／改密、角色与所有权拒绝；真实三角色 seed 登录与改密 |
| US-005—008 | 同上 integration：目录、保存／提交、主备选、墓碑、容量竞争、截止与回滚；`apps/web/src/lib/hooks.test.ts`：dirty／迟到版本；浏览器保存后 0 注册、先修失败保持 v1、有效提交 v2 |
| US-009—012 | integration：教授竞争／资格、名册、上一完成学期、逐格成绩与整份越权；浏览器三人名册与 B 成功／Z 失败保留 A |
| US-013、014、021、023 | integration：人员身份／影响预览／删除、窗口、真实 xlsx；浏览器上传 1 成功／1 重复／1 拒绝与删除无业务记录人员 |
| US-015、016、022 | integration：admission／drain／单轮调剂／事务故障／恢复／补选四门、HTTP 接收后断连与版本替换；`apps/simulators/test/http.test.ts`：41 项外部协议／持久化／故障；浏览器关闭 14 账单送达、0→300 新版 |
| US-018 | integration 的真实并发／故障是局部开发证据；`docs/TEST_PLAN.md`／`docs/testing/acceptance-cases.md` 已准备；大规模性能／可用性／跨浏览器独立验收仍未执行 |
| US-026 | `docs/design-docs/models/system-design.mdj`：1,340 IDs／3,653 refs、9 原生图，StarUML 实际导出及保存重载 |
| US-027 | `packages/db/src/*.integration.test.ts`、`packages/contracts/src/contracts.test.ts`、`scripts/database-url.test.ts`；迁移／约束／随机 seed／隔离库／600 权限；监督 portal 与完整 build |

源码中的后端用例名和 AC 分组说明见 [后端详细设计第 7 节](../design-docs/backend-detail.md#7-实测命令覆盖与尚未验收事项)。一个开发测试可能覆盖多个规则，不能将 108 个测试数直接换算为 64 条 AC 的验收通过率。
