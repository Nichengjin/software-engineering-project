# IT-04：验证与课程交付

- 时间范围：2026-10-14 至 2026-10-16；原计划 10-10 至 10-16 保留。
- 状态：进行中，10-06 提前执行本地测试；统筹倪成锦，独立验收冯海伦，环境材料范昭。
- 上位计划：[execution plan](../exec-plans/active/2026-10-05-delivery-execution.md)。

## 目标与范围

已排入所有 UC-01—14，不新增业务范围。US-018 真实验证及全量回归、缺陷修复、课程材料定稿；候选包不等于课程验收通过。

- [ ] 10-14：候选程序／文档／启动说明／虚构 seed，在独立环境真实复现。
- [ ] 全量 AC-01—64 与 NFR 的对应结果；数据损坏、越权、核心流程阻塞缺陷全部解决或明确不交付。
- [ ] 500／2000 用户负载、120 秒交易及可用性观察窗口真实报告，未达到／未测部分如实说明。
- [ ] Windows 当前 Chrome／Edge 的版本与实际执行覆盖；orb Chromium 检查单独注明。
- [ ] 10-15：设计图、测试报告、配置管理记录及六份个人总结由真实作者／团队确认。
- [ ] 教师确认模拟方案和六人组队口径；答辩演练与缓冲。
- [ ] 10-16：实际课程提交与运行检查结果、正式评审／回顾、获授权后的 PR／发布记录。

## 状态与待办

- [x] 10-09 US-030：完成 [课程方法 A—F](../exec-plans/active/2026-10-09-course-se-methods.md) 的本地源材料：55 项补测、流程图与 PDL、耦合内聚、数据字典、功能点／COCOMO、甘特图／关键路径、手册及截图；16 文件／274 测试与构建通过。验证范围见 [history](../histories/2026-10/20261009-1851-course-se-methods.md)。
- [ ] US-030：成员核对估算与材料，按 [模板](../testing/alpha-session-template.md) 开展真人 Alpha；正式 PR／合入及课程交付另行记录。

- [x] 10-06 本地测试：73项真实PG／HTTP验收集成，最终全量207测试及构建通过；真实API进程重启、60秒重试与事务回滚已验证。
- [x] 真实macOS Chrome流程、在线传播、两档负载及同机干净依赖复现已实际执行；[报告](../TEST_REPORT.md) 区分通过、未达标与环境干扰，不等于所有NFR通过。
- [x] 建立 [逐AC执行账本](../testing/acceptance-execution.md) 与测试报告。
- [x] 10-07 倪成锦分支形成PERF-01修复：TCP对照、三进程负载、目录下一轮合并和查询缩小；215项回归及完整2000用户5＋30分钟长测通过，264615交易全部达标，排空后8000注册及客户端一致。用户授权提交、push，经 [PR #25](https://github.com/Nichengjin/software-engineering-project/pull/25) 检查通过并merge commit合入；证据与限制见 [修复计划](../exec-plans/active/2026-10-07-performance-fix.md) 和报告第5.2节，不等同独立机器／全部NFR或成员评审通过。
- [x] 10-07 US-028：依据分工、完整提交历史与执行线程，七名撰稿subagent形成[六份个人汇报及小组总结初稿](../work-reports/README.md)，各有独立目录。初稿不是本人确认的贡献记录；用户随后授权逐人署名提交及倪成锦Author的merge commit，实际交付见[本轮history](../histories/2026-10/20261007-2304-work-report-drafts.md)。
- [x] 10-08 US-028：按用户要求由五个subagent扩充其余五份个人报告至v0.2，统一采用成员与Agent协作完成代码、人类负责决策的已确认方式；正文与既有图证已形成，本地验证和范围见[扩写计划](../exec-plans/completed/2026-10-08-member-report-expansion.md)。已提交并以merge commit合入本地main，未推送或创建新PR，不沿用旧PR交付状态。
- [x] 10-08 US-029：起草[配置管理计划](../CONFIG_MANAGEMENT_PLAN.md) v0.1；发布脚本改为打包 tag 对应的全部配置项，生成 manifest 与配置项清单，并可解包验证构建。范昭审定、rc tag、跨机复现与最终基线均未执行。
- [ ] US-029：范昭审定配置管理计划，打 `v1.0.0-rc.1` 跨机复现，配置审计通过后打 `v1.0.0` 形成最终配置库。
- [x] 10-09 US-028：用户认可小组稿第三章后，完成[小组总结](../work-reports/team/report.md)v0.4全文重写，并形成[六份个人报告审读意见](../work-reports/individual-style-review.md)；个人稿保持原文。改写与检查见[修订计划](../exec-plans/completed/2026-10-09-team-report-rewrite.md)，本轮修改留在本地任务分支。
- [x] 10-09 US-028：组长确认倪成锦30%，其余五位各14%，[小组总结](../work-reports/team/report.md)v0.5补齐比例与分配依据，合计100%。
- [x] 10-09 US-028：六个subagent分别重写个人报告，倪成锦v0.4、其余五人v0.3；主任务通读并核对内容、版本、图文与共用结果，记录见[个人稿重写计划](../exec-plans/completed/2026-10-09-individual-report-rewrite.md)。本轮为本地Markdown修订，未提交，Word仍保留旧版。
- [x] 10-09 US-028阅读反馈：七份报告撤下现有AI／Agent协作段落，交由成员人工撰写；[审读记录](../work-reports/individual-style-review.md#本轮阅读反馈协作说明标题与配图)补充原位置清单、标题问题分析及逐人补图建议。该次先完成分析，后续标题和新图制作见下一条；Word仍为旧版。
- [x] 10-09 US-028标题与补图：六份个人稿共调整161处章节标题，新增12张PNG与可编辑图源，数据图引用已有记录；倪成锦v0.5，其余五人v0.4。图号、来源和链接同步，见[图表清单](../work-reports/figure-sources/README.md)与[审读结果](../work-reports/individual-style-review.md#标题与配图修订结果)。修改未提交，Word仍为旧版。
- [ ] US-028：六人补充真实经历并审核，组长汇总签名及课程格式；不以初稿形成勾选材料定稿。
- [ ] 补齐账本中的部分子场景，复核容量问题及跨平台／独立机器／七天观察；复核结论集中写入测试报告第8节。

本轮测试代码与文档的提交分支为 `test/fenghailun/us-018-acceptance-execution`，10-07 经 [PR #24](https://github.com/Nichengjin/software-engineering-project/pull/24) 合入 main，远程CI通过；尚无发布tag。按完成定义实际完成合入、CI、验收和追溯后再更新backlog，US-018保持进行中；课程提交与材料定稿未完成。
