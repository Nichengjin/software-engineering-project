# 架构决策记录

每个影响架构、协议、数据模型或关键依赖的决定，都用一份 ADR 留痕，用 `make new-adr SLUG=<slug>` 从 `../templates/adr.md` 生成。

| 编号 | 标题 | 日期 | 状态 |
| --- | --- | --- | --- |
| [ADR-001](ADR-001-technology-stack.md) | 采用 React、TanStack Router、Hono、Prisma 与 PostgreSQL | 2026-09-22 | 已接受 |
| [ADR-002](ADR-002-single-instance-consistency.md) | 单 API 实例、持久化会话及事务 outbox | 2026-10-05 | 已选择供授权执行；团队评审未进行 |
| [ADR-003](ADR-003-catalog-refresh-generations.md) | 合并尚未开始的目录刷新轮次 | 2026-10-07 | 用户授权执行，PR #25已合入；团队／独立复核待办 |
