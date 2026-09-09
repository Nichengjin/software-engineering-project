# harness-template-cn

English version: [`harness-template`](https://github.com/iFurySt/harness-template)

## 简介

一个面向 Agent 协作开发的基础仓库模板，可以用来启动任何你想做的产品或服务。

模板内置了一套**迭代增量开发流程**：需求进待办、按短迭代交付小增量、每个 PR 关联需求编号并满足完成定义、迭代评审通过后打 tag 自动发布。人和 Agent 遵循同一套规则。

## 快速开始

可以在这个仓库右上角直接使用 GitHub 的模板流程：

1. 选择 **Use this template**。
2. 选择 [**Create a new repository**](https://github.com/new?template_name=harness-template-cn&template_owner=iFurySt)。

也可以在新仓库或已有仓库里用 `harness-cli` 初始化：

```sh
harness-cli init --language zh
```

创建后先做三件事：

```sh
make init PROJECT=<项目名>   # 替换模板名
# 把 CODEOWNERS 换成真实成员
# 补齐 docs/ARCHITECTURE.md 和 docs/PRODUCT_SENSE.md
```

## 团队工作流程

下面是一条需求从提出到发布的完整路径，也是每个团队成员默认要走的流程。细则都在对应文档里，这里只画主线。

### 1. 需求进待办

- 所有想做的功能和要修的缺陷都先写进 `docs/product-specs/backlog.md`，拿到 `US-xxx` 或 `BUG-xxx` 编号。
- 需要详细描述时运行 `make new-spec SLUG=<slug>`，按用户故事加 Given / When / Then 验收标准的格式写。
- 产品负责人在迭代计划前维护优先级排序。

### 2. 迭代计划

- 迭代周期固定为 1 到 2 周。运行 `make new-iteration SLUG=<slug>` 建迭代文件，并在 `docs/iterations/README.md` 登记。
- 从待办顶端挑选故事，写一句话迭代目标，把故事拆成 1 到 2 天能合入的任务。
- 跨迭代、高风险或多人协作的任务额外用 `make new-plan SLUG=<slug>` 建 execution plan。影响架构的决定用 `make new-adr SLUG=<slug>` 写 ADR。

### 3. 开发与提交

- 从 `main` 拉分支，命名 `<type>/<需求编号>-<slug>`，例如 `feat/us-001-register`。
- 提交信息遵循 Conventional Commits，正文写 `Refs: US-001`。
- 修 bug 先补一条能复现的测试再改代码。
- 提 PR 前本地运行 `make ci`。

### 4. Pull Request 与评审

- 一个 PR 只做一件事，标题带需求编号。
- 按 PR 模板逐项勾选完成定义：CI 通过、验收标准有测试、文档同步、history 已记、追溯矩阵已更新、release note 已写、待办状态已改。
- 至少一人评审，CI 绿灯后 squash merge，合入即删分支。

### 5. 迭代评审与发布

- 迭代结束基于 `main` 演示，逐条对照验收标准，未通过的退回待办。
- 通过后由 release 负责人打 `vX.Y.Z` tag 并推送，`release.yml` 自动产出制品、SBOM、provenance 和 GitHub Release。
- 回顾三个问题：做得好的、做得不好的、下个迭代改一件事。需要改流程的结论直接改进 `docs/`。

### 每天要遵守的几条

- 没有需求编号不开工，没有测试不合入，没有更新文档不算完成。
- 重要信息只存在聊天记录里等于不存在，落到 `docs/`。
- `main` 随时可发布，不往 `main` 直接推送。

## 文档地图

| 想知道 | 看这里 |
| --- | --- |
| 入口与路由 | `AGENTS.md` |
| 迭代怎么跑 | `docs/ITERATION_GUIDE.md`、`docs/iterations/` |
| 需求怎么写、怎么追溯 | `docs/product-specs/` |
| 分支、提交、版本号 | `docs/GIT_WORKFLOW.md` |
| 完成定义与 PR 要求 | `CONTRIBUTING.md` |
| 测试策略 | `docs/TESTING.md` |
| CI/CD 与发布 | `docs/CICD.md` |
| 架构与决策 | `docs/ARCHITECTURE.md`、`docs/design-docs/adr/` |
| 大任务计划 | `docs/PLANS_GUIDE.md`、`docs/exec-plans/` |
| 变更历史 | `docs/HISTORY_GUIDE.md`、`docs/histories/` |
| 发布记录 | `docs/releases/` |
| 安全与供应链 | `docs/SECURITY.md`、`docs/SUPPLY_CHAIN_SECURITY.md` |

## 常用命令

```sh
make ci                          # 本地跑与 CI 相同的门禁
make new-spec SLUG=<slug>        # 新建用户故事
make new-iteration SLUG=<slug>   # 新建迭代
make new-plan SLUG=<slug>        # 新建 execution plan
make new-adr SLUG=<slug>         # 新建架构决策记录
make new-history SLUG=<slug>     # 新建变更历史
```

## 许可证

[MIT](LICENSE)

## 备注

这套方法主要来自我们自己的持续实践和整理，同时也吸收了 OpenAI 在 [harness engineering 文章](https://openai.com/index/harness-engineering/) 中的一部分思路，最后汇总成了这个模板。
