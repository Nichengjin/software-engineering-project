# 需求追溯矩阵

这张表回答一个问题：每条需求从提出到发布，经过了哪些产物。每次 PR 合入后由 PR 作者补一行或更新一行。

## 追溯规则

- 一行一个需求编号（`US-xxx` 或 `BUG-xxx`）。
- PR 标题或描述里必须出现需求编号，评审者据此核对。
- 测试列填测试文件路径或测试用例名，没有自动化测试时填手工验证记录的位置。
- 发布列填包含该需求的 tag。
- “验收设计”只引用预期行为；“测试证据”才记录实际执行结果。初稿可先登记对应关系，未合入、未测试、未发布时明确保留待补状态。

## 实现候选初稿的验收矩阵

下表保留初稿时的 PR 记录及独立验收状态；后续已创建 PR 的当前映射见末节，未将创建 PR 等同合入。开发自测已经执行的证据另见下一节，不把 Agent 自测记成冯海伦验收。

| 需求 | Spec | 迭代 | ADR / Plan | PR | 独立验收设计 | 独立验收／文档检查证据 | 发布 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| US-002 | [开发计划](../PROJECT_DEVELOPMENT_PLAN.md)、[团队分工](../TEAM_ROLES.md) | IT-01 | [本地提交与分支](../exec-plans/active/2026-10-05-collaboration-history.md) | 未创建 | 计划第 8 节团队评审 | [集中拆分与检查记录](../histories/2026-10/20261005-1249-collaboration-workflow.md)；团队评审待办 | 未发布 |
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

上述为实现阶段的状态；后续授权已创建 PR #6—23，见末节。尚未合入或发布，独立验收状态不变。

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

## 2026-10-05 后续授权的真实 PR 映射（创建时均未合入）

以下只登记与需求直接相关的任务，不把所有祖先提交重复算为本 PR 的新增贡献。集成入口和完整 CI 分别见 #22、#23，依赖顺序见 [分支计划第 8 节](../exec-plans/active/2026-10-05-collaboration-history.md#8-已创建的真实-pr-与远程限制)。创建阶段除 #6 待审外其余均为草稿、检查有失败；最新决定改为组长集中使用原 PR 合入，不创建替代编号。实际合入以各链接的 `mergedAt` 及执行记录为准，未因集成而将需求改为独立验收完成。

| 需求 | 已创建 PR |
| --- | --- |
| US-002、025、026 | [#6 计划／设计](https://github.com/Nichengjin/software-engineering-project/pull/6) |
| US-026、027 | [#8 契约／数据库](https://github.com/Nichengjin/software-engineering-project/pull/8) |
| US-027 | [#7 workspace](https://github.com/Nichengjin/software-engineering-project/pull/7)、[#9 seed／运行](https://github.com/Nichengjin/software-engineering-project/pull/9)、[#22 集成](https://github.com/Nichengjin/software-engineering-project/pull/22)、[#23 CI／协作记录](https://github.com/Nichengjin/software-engineering-project/pull/23) |
| US-004、017 | [#10 认证／安全](https://github.com/Nichengjin/software-engineering-project/pull/10)、[#11 登录公共层](https://github.com/Nichengjin/software-engineering-project/pull/11) |
| US-005 | [#12 目录模拟](https://github.com/Nichengjin/software-engineering-project/pull/12)、[#13 同步](https://github.com/Nichengjin/software-engineering-project/pull/13)、[#16 学生页面](https://github.com/Nichengjin/software-engineering-project/pull/16) |
| US-006—008 | [#14 课表规则](https://github.com/Nichengjin/software-engineering-project/pull/14)、[#16 学生页面](https://github.com/Nichengjin/software-engineering-project/pull/16) |
| US-009—011 | [#15 授课／名册／成绩](https://github.com/Nichengjin/software-engineering-project/pull/15) |
| US-012 | [#16 成绩单页面](https://github.com/Nichengjin/software-engineering-project/pull/16)、[#22 查询入口](https://github.com/Nichengjin/software-engineering-project/pull/22) |
| US-013、014、023 | [#17 人员与导入](https://github.com/Nichengjin/software-engineering-project/pull/17) |
| US-015、022 | [#20 关闭／补选事务](https://github.com/Nichengjin/software-engineering-project/pull/20)、[#21 教务操作](https://github.com/Nichengjin/software-engineering-project/pull/21) |
| US-016 | [#12 计费模拟](https://github.com/Nichengjin/software-engineering-project/pull/12)、[#19 计费发送](https://github.com/Nichengjin/software-engineering-project/pull/19) |
| US-021 | [#18 窗口页面](https://github.com/Nichengjin/software-engineering-project/pull/18)、[#22 写事务入口](https://github.com/Nichengjin/software-engineering-project/pull/22) |
| US-018 独立验收 | 仍未创建，开发测试和初稿用例不替代独立实测 |

初期远程检查与设置阻断记入 [协作 history](../histories/2026-10/20261005-1249-collaboration-workflow.md)。检查修复、依赖升级、授课历史时钟复现与 134 项完整开发回归见 [检查 history](../histories/2026-10/20261005-merge-checks.md)。集中合入不补造成员审批；独立验收与发布证据仍待实际执行。

US-002 成员说明及 Agent 指令随 [PR #23](https://github.com/Nichengjin/software-engineering-project/pull/23) 提供：[成员入口](../member-guides/README.md)。历史 [接手脚本](../../scripts/member-pr.mjs) 与 [25 项模拟测试](../../scripts/member-pr.test.ts) 保留但本轮不执行 `--apply`；未来真实新工作从最新 main 新分支开始。设置已确认默认 main／仅 merge commit，上表保留原 PR，不预填成员替代编号或审批结果。

## 2026-10-05 合入确认

上表现有 #6—23 已全部通过 merge commit 合入 main；GitHub API 的 18 个 `mergedAt` 与主线双亲节点逐项核对通过，原 30 个普通提交完整保留，详见 [实际合入记录](../exec-plans/active/2026-10-05-collaboration-history.md#10-实际合入确认)。US-002 的成员指南随 #23 合入，US-027 的检查修复分布于 #6／7／22／23；其余需求仍按上表对应 PR 追溯。

完整 [远程 CI](https://github.com/Nichengjin/software-engineering-project/actions/runs/37324793707) 包含 134 tests、真实 PG15、strict typecheck、所有 app build；[供应链检查](https://github.com/Nichengjin/software-engineering-project/actions/runs/37324793608) 通过。US-018 独立验收、团队评审与发布仍未执行，需求不因合入自动变为“完成”。

## 2026-10-06 US-018 本地测试证据

| 需求／范围 | 实际证据 | PR／发布及限制 |
| --- | --- | --- |
| US-018，覆盖US-004—017、021—023 | [73项验收集成](../../tests/acceptance/scenarios.integration.test.ts)、[Chrome脚本](../../tests/e2e/browser-runner.ts)、[负载](../../tests/load/nfr01-03.ts)；最终本地 `make ci` 207项通过；[逐AC账本](../testing/acceptance-execution.md)、[测试报告](../TEST_REPORT.md)、[history](../histories/2026-10/20261006-1640-acceptance-execution.md) | 提交分支 `test/fenghailun/us-018-acceptance-execution`，用户授权冯海伦Author／Amp Committer；未覆盖子场景、NFR结果及复核结论见报告与账本。10-07 经 [PR #24](https://github.com/Nichengjin/software-engineering-project/pull/24) 以 merge commit `5259bbd` 合入 main，PR 检查与合入后 [远程 CI](https://github.com/Nichengjin/software-engineering-project/actions/runs/37588458377) 通过；未经成员评审，尚无发布 tag |

本节更新实际执行状态，不改写上方历史记录。测试数量不等于AC完成数；US-018仍进行中。

## 2026-10-07 US-018／PERF-01 修复与合入

| 需求／范围 | 实际证据 | PR／发布及限制 |
| --- | --- | --- |
| US-018，目录吞吐与TCP分层排查 | [ADR-003](../design-docs/adr/ADR-003-catalog-refresh-generations.md)、[修复计划](../exec-plans/active/2026-10-07-performance-fix.md)、[history](../histories/2026-10/20261007-1918-catalog-throughput.md)；目录屏障及真实PG投影回归，LinuxTCP对照及三进程负载；本地及 [PR CI](https://github.com/Nichengjin/software-engineering-project/actions/runs/37625656581) 215项通过，完整2000用户5＋30分钟264615交易全部达标，排空后8000注册及客户端一致。原始证据与限制见 [测试报告第5.2节](../TEST_REPORT.md#52-linux-orb-的目录修复与三进程复测2026-10-07) | 倪成锦Author／Amp Committer，分支 `fix/nichengjin/us-018-catalog-throughput` 已推送，用户授权 [PR #25](https://github.com/Nichengjin/software-engineering-project/pull/25) 以 [merge commit 5d3690b](https://github.com/Nichengjin/software-engineering-project/commit/5d3690b38cba8f4705240168e99aa1cd0079c417) 合入main，原提交保留。PERF-01待独立复核，非生产容量认证；PERF-02和US-018整体继续进行中，未发布 |

## 2026-10-07 US-028 汇报初稿与合入

| 需求／范围 | 实际证据 | PR／发布及限制 |
| --- | --- | --- |
| US-028，六份个人工作汇报与小组总结初稿 | [七份初稿入口](../work-reports/README.md)、[逐人提交及验证history](../histories/2026-10/20261007-2304-work-report-drafts.md)；七个原提交，其中六份个人报告各自单独署名，小组及公共记录倪成锦Author、实际Committer为Amp；本地 `make ci` 215项、类型检查及构建通过，本轮Markdown与相对链接／提交引用检查通过 | 已推送任务分支，经[PR #27](https://github.com/Nichengjin/software-engineering-project/pull/27)检查通过，以倪成锦Author的双亲merge commit合入main并保留原提交。集中合入不是本人审核、贡献确认或课程交付；US-028待评审，材料定稿、签名及发布未完成 |

US-028后续修订：[倪成锦v0.2报告](../work-reports/nichengjin/report.md)按需求到交付八阶段扩写，补足决策原因、真实问题、修复验证与复盘，并附独立数据库／HTTP模拟下四状态实拍；本轮验证见同一history续记。原提交[eb5b95a](https://github.com/Nichengjin/software-engineering-project/commit/eb5b95a60b47b9db735e45e256a53effd86997a0)已推送，2026-10-08经[PR #28](https://github.com/Nichengjin/software-engineering-project/pull/28)的[完整CI](https://github.com/Nichengjin/software-engineering-project/actions/runs/37740235676)及[供应链检查](https://github.com/Nichengjin/software-engineering-project/actions/runs/37740235675)通过，以倪成锦Author／Amp Committer的双亲merge commit合入main并保留原提交；其他成员与小组报告未改，不沿用PR #27的交付状态，不变更US-028待评审状态。

## 2026-10-08 US-028 五份成员报告扩充

用户补充确认各成员与Agent共同完成代码、人类负责决策，Amp名称主要来自统一撰写提交信息；据此更正旧材料对成员参与的笼统推断，不改写原Git历史。五个subagent分别扩充浩宇、马喆、冯海洋、冯海伦和范昭的报告至v0.2，主agent核对技术事实、修复归属、历史测试环境及图文对应；入口见[五份扩充稿](../work-reports/README.md)，范围见[已完成计划](../exec-plans/completed/2026-10-08-member-report-expansion.md)，验证见[history续记](../histories/2026-10/20261007-2304-work-report-drafts.md)。

本轮新增4张已有验收截图的原样副本并引用共享设计图；倪成锦报告与小组总结仅修正协作来源。定向复核前端请求及版本保护的2文件／8项已有单测通过；未重新运行完整业务验收、浏览器或负载。改动及后续本人经历、分析图图例和Word版本已从 `docs/nichengjin/us-028-member-report-expansion` 以merge commit合入本地main，保留原提交；未推送或创建新PR，不能沿用PR #27或#28的检查状态。US-028仍待评审，工时、贡献比例、签名与课程定稿另行完成。

## 2026-10-09 US-028 小组报告重写与个人稿审读

用户认可小组报告第三章后，继续重写其余章节至v0.4，保留第三章原文；新增[六份个人稿审读意见](../work-reports/individual-style-review.md)，同步写作要求与修订状态。组长随后确认贡献比例为倪成锦30%、其余五位各14%，已补入[小组总结v0.5](../work-reports/team/report.md)，合计100%。个人稿未改，产品代码和测试未改。范围与检查见[已完成计划](../exec-plans/completed/2026-10-09-team-report-rewrite.md)和[history续记](../histories/2026-10/20261007-2304-work-report-drafts.md)。本轮按用户要求在 `docs/nichengjin/us-028-report-style` 分支提交，作者为倪成锦，记录Codex协作；尚未推送或合入。US-028仍待评审，成员审核、签名和课程定稿继续安排。

## 2026-10-08 US-029 配置管理计划草案

| 需求／范围 | 实际证据 | PR／发布及限制 |
| --- | --- | --- |
| US-029，配置管理计划与最终配置库 | [配置管理计划 v0.1](../CONFIG_MANAGEMENT_PLAN.md)、[history](../histories/2026-10/20261008-2112-config-management-plan.md)；`scripts/release-manifest.test.ts` 3 项通过；本地 `make release-package` 生成含 318 个配置项的清单，`RELEASE_VERIFY_BUILD=1` 解包后锁定安装与构建通过 | 原提交 [caf3890](https://github.com/Nichengjin/software-engineering-project/commit/caf3890148ac067a6306ef5d53d88affd0fb554b) 范昭署名，分支 `docs/nichengjin/us-029-config-management` 经 [PR #29](https://github.com/Nichengjin/software-engineering-project/pull/29) 完整 CI 与 OSV 通过（dependency-review 因仓库未开启 Dependency graph 失败，与本次无关），用户授权以倪成锦 Author 的 merge commit 合入 main。本地 main 曾另以范昭 Author 的 merge commit [07782fa](https://github.com/Nichengjin/software-engineering-project/commit/07782fa7640426bfbf3f52da013a86e65f970664) 重复合入同一原提交，2026-10-09 与远程 main 合并后一并推送，内容相同。范昭审定、rc／最终 tag、跨机复现均未执行，US-029 进行中，未发布 |
