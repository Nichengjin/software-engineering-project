# 产品规格索引

这个目录用于记录面向用户行为的功能定义和工作流说明。

## 文件

- `backlog.md`：产品待办列表，唯一的需求入口。
- `templates/user-story.md`：用户故事模板，用 `make new-spec SLUG=<slug>` 生成。
- `traceability.md`：需求追溯矩阵，记录需求到发布的完整链路。
- `US-xxx-<slug>.md`：单个用户故事的详细 spec。

## 建议约定

- 一个功能或流程一份 spec，编号与 `backlog.md` 一致。
- 从用户问题和可见结果写起，不要一上来就写实现。
- 验收标准用 Given / When / Then 写，每条都要能独立验证。
- 关联对应的迭代、execution plan、ADR、测试、PR 和 release note。
