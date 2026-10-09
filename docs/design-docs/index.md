# 设计文档索引

用这个目录集中管理架构设计和产品设计文档。

## 建议约定

- 一个主题一份文档。
- 每份文档写清当前状态和简短摘要。
- 关联引入它的 execution plan、用户故事或迭代。

## 文件

- `core-beliefs.md`：Agent-first 的工作原则。
- `adr/`：架构决策记录，索引见 `adr/README.md`。
- [ADR-001](adr/ADR-001-technology-stack.md)：已确定的技术栈，React + TypeScript + Vite + TanStack Router、Hono、Prisma、PostgreSQL 与 StarUML；包含当前不采用 TanStack Start 的理由。
- [面向对象分析](object-oriented-analysis.md)：US-024／IT-01，基于需求 v0.6 的实体、边界、控制类及 UC-01 至 UC-14 职责映射；选课、关闭与计费的 9 张图及 [StarUML 源模型](models/object-oriented-analysis.mdj)；[系统用例模型](models/use-case-model.mdj) 导出为 U01。分析初稿待评审，不等同于总体设计或业务实现。
- [总体设计](system-design.md)／[API 契约](api-contract.md)：US-026／IT-02，单 API、npm workspace、实体字段、UC-01—14 HTTP／DTO、认证错误、关闭与 outbox 恢复、外部模拟和测试接口；用户授权下供实现的初稿，团队评审未执行。
- [ADR-002](adr/ADR-002-single-instance-consistency.md)：单实例、持久化会话、事务锁和计费 outbox 的技术决定及限制。
- [设计模型与导出图](design-models.md)：US-026 部署、组件、数据与关闭／计费顺序共 9 图；[可编辑源模型](models/system-design.mdj) 已由 StarUML CLI 导出、GUI 保存重载验证，保留试用水印，团队走查待办。
- `templates/adr.md`：ADR 模板。

## 课程方法补充（US-030）

- [核心算法过程设计](algorithm-design.md)：正式提交、关闭调剂、计费重试的流程图、PDL 与复杂度；[StarUML 源模型](models/course-methods.mdj)。
- [数据字典](data-dictionary.md)：定义式、主要数据流、18 张表及 11 个枚举；附顶层数据流图。
- [模块独立性](system-design.md)：模块结构、耦合／内聚与改进方向。
- [可维护性](maintainability.md)：理解、测试、修改、移植和维护类型。
- [课程估算与进度](../project-management/course-estimation-and-schedule.md)：功能点、COCOMO、甘特图和关键路径。
- [用户操作手册](../USER_MANUAL.md)：三角色简版步骤及真实界面截图。
