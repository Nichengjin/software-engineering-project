# 需求追溯矩阵

这张表回答一个问题：每条需求从提出到发布，经过了哪些产物。每次 PR 合入后由 PR 作者补一行或更新一行。

## 追溯规则

- 一行一个需求编号（`US-xxx` 或 `BUG-xxx`）。
- PR 标题或描述里必须出现需求编号，评审者据此核对。
- 测试列填测试文件路径或测试用例名，没有自动化测试时填手工验证记录的位置。
- 发布列填包含该需求的 tag。
- “验收设计”只引用预期行为；“测试证据”才记录实际执行结果。初稿可先登记对应关系，未合入、未测试、未发布时明确保留待补状态。

## 矩阵

| 需求 | Spec | 迭代 | ADR / Plan | PR | 验收设计（未执行） | 测试证据 | 发布 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| US-002 | [开发计划](../PROJECT_DEVELOPMENT_PLAN.md)、[团队分工](../TEAM_ROLES.md) | IT-01 | 同 Spec | 未创建 | 计划第 8 节团队评审 | 待评审 | 未发布 |
| US-003 | [需求分析](../REQUIREMENTS_ANALYSIS.md) | IT-01 | [开发计划](../PROJECT_DEVELOPMENT_PLAN.md) | 未创建 | 需求分析第 12.3 节文档验收 | 待评审 | 未发布 |
| US-019 | [选型记录](../design-docs/adr/ADR-001-technology-stack.md) | IT-01 | ADR-001 | 未创建 | ADR-001 文档验收条件，含 Router／Start 取舍 | [文档检查记录](../histories/2026-09/20260922-1420-technology-stack.md)；待合入 | 未发布 |
| US-020 | [课件文字与索引](../lecture-notes/README.md) | IT-01 | 无新增架构决定 | 未创建 | 课件索引中的 US-020 验收条件 | [资料校验记录](../histories/2026-09/20260922-1535-courseware-text.md)；待合入 | 未发布 |
| US-004 | [UC-01](../REQUIREMENTS_ANALYSIS.md#uc-01) | 待排期 | 待设计 | 未创建 | AC-01、AC-02、AC-43、AC-44 | 未执行 | 未发布 |
| US-005 | [UC-02](../REQUIREMENTS_ANALYSIS.md#uc-02) | 待排期 | 待设计 | 未创建 | AC-03、AC-04、AC-45、AC-46 | 未执行 | 未发布 |
| US-006 | [UC-03](../REQUIREMENTS_ANALYSIS.md#uc-03) | 待排期 | 待设计 | 未创建 | AC-05、AC-47、AC-48、AC-64 | 未执行 | 未发布 |
| US-007 | [UC-03](../REQUIREMENTS_ANALYSIS.md#uc-03) | 待排期 | 待设计 | 未创建 | AC-06 至 AC-10、AC-12、AC-13、AC-49、AC-50、AC-64 | 未执行 | 未发布 |
| US-008 | [UC-03](../REQUIREMENTS_ANALYSIS.md#uc-03) | 待排期 | 待设计 | 未创建 | AC-11、AC-12、AC-63 | 未执行 | 未发布 |
| US-009 | [UC-04](../REQUIREMENTS_ANALYSIS.md#uc-04) | 待排期 | 待设计 | 未创建 | AC-14 至 AC-16、AC-51 | 未执行 | 未发布 |
| US-010 | [UC-05](../REQUIREMENTS_ANALYSIS.md#uc-05) | 待排期 | 待设计 | 未创建 | AC-17、AC-18 | 未执行 | 未发布 |
| US-011 | [UC-06](../REQUIREMENTS_ANALYSIS.md#uc-06) | 待排期 | 待设计 | 未创建 | AC-19 至 AC-21 | 未执行 | 未发布 |
| US-012 | [UC-07](../REQUIREMENTS_ANALYSIS.md#uc-07) | 待排期 | 待设计 | 未创建 | AC-22、AC-23 | 未执行 | 未发布 |
| US-013 | [UC-08](../REQUIREMENTS_ANALYSIS.md#uc-08) | 待排期 | 待设计 | 未创建 | AC-24、AC-25、AC-52 | 未执行 | 未发布 |
| US-014 | [UC-09](../REQUIREMENTS_ANALYSIS.md#uc-09) | 待排期 | 待设计 | 未创建 | AC-26、AC-27、AC-53 | 未执行 | 未发布 |
| US-015 | [UC-10](../REQUIREMENTS_ANALYSIS.md#uc-10) | 待排期 | 待设计 | 未创建 | AC-28 至 AC-33、AC-54、AC-55 | 未执行 | 未发布 |
| US-016 | [UC-11](../REQUIREMENTS_ANALYSIS.md#uc-11) | 待排期 | 待设计 | 未创建 | AC-34 至 AC-36 | 未执行 | 未发布 |
| US-017 | [权限](../REQUIREMENTS_ANALYSIS.md#security) | 待排期 | 待设计 | 未创建 | AC-18、AC-37 至 AC-42 | 未执行 | 未发布 |
| US-018 | [非功能](../REQUIREMENTS_ANALYSIS.md#nfr) | 待排期 | 待设计 | 未创建 | NFR-01 至 NFR-10 的验证方法 | 未执行 | 未发布 |
| US-021 | [UC-12](../REQUIREMENTS_ANALYSIS.md#uc-12) | 待排期 | 待设计 | 未创建 | AC-56 | 未执行 | 未发布 |
| US-022 | [UC-13](../REQUIREMENTS_ANALYSIS.md#uc-13) | 待排期 | 待设计 | 未创建 | AC-57、AC-58、AC-62 | 未执行 | 未发布 |
| US-023 | [UC-14](../REQUIREMENTS_ANALYSIS.md#uc-14) | 待排期 | 待设计 | 未创建 | AC-59 至 AC-61 | 未执行 | 未发布 |
| US-024 | [面向对象分析](../design-docs/object-oriented-analysis.md) | IT-01 | 无新增技术设计决定 | 未创建 | 分析第 8—9 节走查及文档验收 | [模型与文档检查](../histories/2026-10/20261005-0108-oo-analysis.md)；团队评审与业务测试未执行 | 未发布 |
| US-025 | [项目北极星](../NORTH_STAR.md) | IT-01 | 修订排期待团队确认后同步开发计划 | 未创建 | 北极星第 3 节排期经团队确认；第 4 节提交物清单与课程要求一致 | [文档检查记录](../histories/2026-10/20261005-0130-north-star-timeline.md)；团队评审未执行 | 未发布 |

原 US-001 行中的 PR、测试路径及发布版本均为模板示例，已移除，不能作为本项目的交付证据；该编号仍在 backlog 中保留并标记已取消。
