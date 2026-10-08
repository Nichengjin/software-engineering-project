# harness-template-cn

这个仓库是一个面向 Agent 协作开发的基础模板，开发流程采用迭代增量模型（短迭代、小增量、持续交付）。

`AGENTS.md` 故意保持简短，只负责做导航，不负责塞满所有规则。仓库内的 `docs/` 才是本地知识的正式来源。

如果一次代码或流程变更会让某份文档过期，就在同一轮任务里顺手把它改掉。

## 每轮开始先读

- `docs/REPO_COLLAB_GUIDE.md`：仓库级协作、提交、文档同步与测试约定。
- `docs/ITERATION_GUIDE.md`：迭代流程，从待办挑需求到评审、回顾怎么走。
- `docs/ARCHITECTURE.md`：仓库整体结构和预期边界。
- `docs/design-docs/core-beliefs.md`：Agent-first 的工作原则和这个模板的设计出发点。
- `docs/NORTH_STAR.md`：课程流程时间轴与打勾清单，确认当前所处阶段。
- `docs/TEAM_ROLES.md`：成员分工、需求负责人与评审人，以及提交作者规则。

## 动手之前要确认

- 任务对应 `docs/product-specs/backlog.md` 里的哪个需求编号；没有就先加一行。
- 需求编号所属的迭代文件在 `docs/iterations/`。
- 分支和提交按 `docs/GIT_WORKFLOW.md` 命名。

## 代码改完前要读

- `CONTRIBUTING.md`：完成定义（Definition of Done），PR 前逐项自查。
- `docs/TESTING.md`：验收标准要有对应测试，修 bug 先补复现测试。
- `docs/HISTORY_GUIDE.md`：什么时候记 history、怎么命名、怎么脱敏。
- `docs/product-specs/traceability.md`：合入后补上需求到 PR、测试、发布的追溯行。
- `docs/QUALITY_SCORE.md`：当前质量分层和主要短板。

## 按任务需要选读

- `docs/PLANS_GUIDE.md`：跨迭代或高风险任务什么时候要写 execution plan。
- `docs/design-docs/adr/README.md`：架构、协议、数据模型的决定要写 ADR。
- `docs/PRODUCT_SENSE.md`：产品价值、取舍方式和优先级判断。
- `docs/RELIABILITY.md`：运行稳定性、观测性和上线前的基本要求。
- `docs/SECURITY.md`：认证、数据处理、外部集成等安全默认约束。
- `docs/SUPPLY_CHAIN_SECURITY.md`：依赖、SBOM、制品 provenance 和仓库级供应链安全默认做法。
- `docs/CICD.md`：CI 门禁、tag 触发发布以及后续如何接入真实项目。
- `docs/CONFIG_MANAGEMENT_PLAN.md`：配置项、版本命名、基线后的变化控制、配置审计和最终配置库。
- `docs/FRONTEND.md`：如果仓库包含前端界面，这里记录对应规范。
- `docs/releases/README.md`：如何维护面向用户的发布记录。
- `docs/references/README.md`：沉淀到仓库里的外部参考资料。

## 常用命令

- `make ci`：本地跑与 CI 相同的门禁。
- `make new-spec SLUG=<slug>`：新建用户故事。
- `make new-iteration SLUG=<slug>`：新建迭代文件。
- `make new-plan SLUG=<slug>`：新建 execution plan。
- `make new-adr SLUG=<slug>`：新建架构决策记录。
- `make new-history SLUG=<slug>`：新建变更历史记录。

## 工作规则

- 优先选择小而清晰、对仓库和 Agent 都友好的抽象。
- prompt、规则、架构约束尽量都版本化落在仓库里。
- 复杂任务不要只靠聊天上下文，应该落 execution plan。
- 完成的代码变更要记到 `docs/histories/`。
- 一个 PR 只做一件事，必须关联需求编号，满足完成定义才算完成。
