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
- `templates/adr.md`：ADR 模板。
