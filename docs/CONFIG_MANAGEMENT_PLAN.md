# 软件配置管理计划与最终配置库

- 版本：v0.1 草案，2026-10-08；关联需求：US-029；迭代：IT-04。
- 责任：范昭主责，倪成锦评审（见 [开发计划](PROJECT_DEVELOPMENT_PLAN.md) 第 5 节）。本稿由倪成锦与 Agent 依据仓库现有规则起草，范昭审定后才作为团队计划生效。
- 课程依据：[课程设计要求](lecture-requirements/2026年软件工程课程设计要求.md) 第 5 项“（可选项）软件配置管理计划与最终配置库”；概念与任务划分依据 [课件 9.5 软件项目配置管理](lecture-notes/text/9.5项目管理-软件项目配置管理.txt)。

## 1. 目的与范围

本组在 Git 仓库中开发 Wylie College 选课系统，代码、文档、数据库迁移、测试和演示数据都在同一个仓库里持续修改。配置管理要回答三个问题：交付的到底是哪个版本，这个版本由哪些文件组成，以及这些文件彼此是否一致。

课件把软件配置管理分为标识、版本控制、变化控制、配置审计和配置状态报告五项任务，本计划第 2—6 节逐项对应。第 7 节说明最终配置库怎样生成和交付。

本计划覆盖仓库内全部版本化文件。以下内容不纳入配置库，原因见第 2.3 节：本机私有配置、数据库运行数据、外部模拟系统运行状态、依赖安装目录和构建输出。

## 2. 配置标识

### 2.1 配置项分类

课件中的软件配置项（SCI）是“软件过程输出的全部计算机程序、文档、数据”。本组以 Git 中已提交的每个文件为最小配置项，按下表分成 13 类。分类规则写在 [release-manifest.mjs](../scripts/release-manifest.mjs) 中，生成最终配置库时自动给每个文件归类并输出清单，避免手工清单与实际文件脱节。

| 类别 ID | 名称 | 典型路径 | 主责 |
| --- | --- | --- | --- |
| `source` | 程序源代码 | `apps/api`、`apps/web`、`apps/simulators`、`packages/contracts`、`packages/db/src` | 各模块负责人 |
| `database` | 数据模型与迁移 | `packages/db/prisma/schema.prisma`、`packages/db/prisma/migrations/` | 倪成锦 |
| `seed-data` | 虚构演示数据与初始化 | `packages/db/seed/`、`packages/db/prisma/seed.ts` | 范昭 |
| `test` | 自动化测试 | `tests/`、`*/test/`、`*.test.ts` | 冯海伦与各模块负责人 |
| `build-config` | 依赖与构建配置 | `package.json`、`package-lock.json`、`tsconfig*.json`、`vite.config.ts`、`.nvmrc` | 倪成锦、范昭 |
| `runtime-config` | 运行配置示例 | `.env.example`、`compose.yaml`、`.amp/services.yaml`、`.agents/setup` | 范昭 |
| `process-tooling` | 工程流程与自动化 | `.github/`、`scripts/`、`Makefile` | 倪成锦、范昭 |
| `requirements` | 需求与追溯 | `docs/REQUIREMENTS_ANALYSIS.md`、`docs/product-specs/` | 倪成锦 |
| `design-docs` | 分析与设计文档 | `docs/design-docs/`（含 UML 源模型与导出图）、`docs/ARCHITECTURE.md` 等 | 倪成锦与各模块负责人 |
| `test-docs` | 测试计划与报告 | `docs/TEST_PLAN.md`、`docs/TEST_REPORT.md`、`docs/testing/` | 冯海伦 |
| `records` | 过程记录与汇报 | `docs/histories/`、`docs/exec-plans/`、`docs/iterations/`、`docs/work-reports/`、`docs/releases/` | 各记录作者 |
| `project-docs` | 项目管理与协作文档 | 开发计划、团队分工、Git 工作流、本计划等其余文档 | 倪成锦 |
| `course-input` | 课程输入资料 | `docs/lecture-requirements/`、`docs/lecture-notes/` | 倪成锦 |

### 2.2 主要课程交付配置项

课程要求的交付物各自对应一个或一组文件。每份文档在开头写版本号，正文末尾维护变更记录表，版本号与 Git 提交共同标识文档的某一个状态。

| 配置项 | 文件 | 2026-10-08 版本 |
| --- | --- | --- |
| 开发计划 | [PROJECT_DEVELOPMENT_PLAN.md](PROJECT_DEVELOPMENT_PLAN.md) | v0.4 |
| 需求分析 | [REQUIREMENTS_ANALYSIS.md](REQUIREMENTS_ANALYSIS.md) | v0.6 |
| 面向对象分析 | [object-oriented-analysis.md](design-docs/object-oriented-analysis.md) | v0.3 |
| 总体设计与接口 | [system-design.md](design-docs/system-design.md)、[api-contract.md](design-docs/api-contract.md) | 均为 v0.1 |
| 详细设计 | [backend-detail.md](design-docs/backend-detail.md)、[FRONTEND.md](FRONTEND.md)、[SIMULATORS.md](SIMULATORS.md) | 后端 v0.6；前端与模拟说明未标版本 |
| UML 设计模型 | [system-design.mdj](design-docs/models/system-design.mdj) 及导出图 | 9 张设计图，未标版本 |
| 测试计划 | [TEST_PLAN.md](TEST_PLAN.md)、[acceptance-cases.md](testing/acceptance-cases.md) | 计划 v0.2；验收用例 v0.6，64 条 |
| 测试报告 | [TEST_REPORT.md](TEST_REPORT.md)、[acceptance-execution.md](testing/acceptance-execution.md) | v0.3 |
| 个人与小组总结 | [work-reports/](work-reports/README.md) | 初稿 |
| 配置管理计划 | 本文件 | v0.1 草案 |
| 运行说明 | [DEVELOPMENT.md](DEVELOPMENT.md) | 未标版本 |
| 可运行程序 | `apps/`、`packages/`、`package-lock.json`、迁移与 seed | 以 Git 提交标识 |

表中“版本”列在每次建立基线时随第 8 节状态报告一并更新，不单独维护。未标版本的文档在进入最终基线前补上版本号和变更记录。

### 2.3 不纳入配置库的内容

| 内容 | 位置 | 不纳入的原因 | 如何获得 |
| --- | --- | --- | --- |
| 本机私有配置 | `.env` | 含数据库密码与签名密钥，每台机器独立生成 | `npm run env:local` 按 `.env.example` 生成随机值 |
| 演示账号初始密码 | `.local/demo-credentials.json` | 明文密码，权限 600 | 在新数据库上运行 `npm run db:seed` 生成 |
| 数据库运行数据 | PostgreSQL 数据目录或 Compose volume | 运行状态，不属于源码 | 迁移与 seed 重建；需要保留时按第 7.4 节备份 |
| 外部模拟运行状态 | `tmp/simulators-state.json` | 运行状态，含已接收账单 | 启动时由 `SIM_SEED_PATH` 初始化 |
| 依赖安装目录 | `node_modules/` | 由锁文件确定，可重建 | `npm ci` |
| 构建输出 | `apps/*/dist`、`packages/*/dist`、`dist/` | 由源码确定，可重建 | `npm run build`、`make release-package` |

这些路径已写入 `.gitignore`。`scripts/check-repo-hygiene.sh` 在每次 CI 中检查 `.env`（`.env.example` 除外）、`.local/`、`tmp/` 没有被提交；`.gitignore` 只能阻止新增，已被跟踪的文件仍需这项检查兜底。

## 3. 版本控制

### 3.1 工具与存储

- 版本库：GitHub 私有仓库 `Nichengjin/software-engineering-project`，`main` 为唯一长期分支。课件所说的“项目数据库”即该仓库：基线以 tag 形式保存在其中，配合 PR 审阅和 CI 保护。
- 每个提交由 SHA 唯一标识；文件的任一历史状态都能用“提交 SHA ＋ 路径”取回。
- 依赖版本由 `package-lock.json` 锁定，`npm ci` 只按锁文件安装。运行时要求写在 `package.json`：Node.js `>=22.12`、npm `10.9.9`；数据库为 PostgreSQL 15，Compose 镜像与 CI service 均固定为 `postgres:15-bookworm`。
- GitHub Actions 全部固定到 commit SHA，`scripts/check-action-pinning.sh` 在 CI 中检查，见 [供应链安全](SUPPLY_CHAIN_SECURITY.md)。

### 3.2 版本命名

按 [Git 工作流](GIT_WORKFLOW.md) 使用语义化版本 tag `vMAJOR.MINOR.PATCH`，tag 必须是 annotated tag，打在 `main` 的合并提交上。

| 标识 | 含义 | 何时创建 |
| --- | --- | --- |
| 提交 SHA | 任一中间状态 | 每次提交自动产生 |
| `v1.0.0-rc.N` | 交付候选，用于跨机复现和答辩演练 | 迭代评审前，每次修复后递增 N |
| `v1.0.0` | 课程最终交付基线，即最终配置库 | 第 6 节审计通过、团队确认后 |
| `v1.0.x` | 交付后只修缺陷 | 提交后发现必须修复的问题时 |

课程最终交付是本系统第一个完整可用版本，因此用 `1.0.0`，不沿用模板中按迭代递增 MINOR 的示例编号。截至本稿仓库尚无任何 tag。

课件给出的 `<SYSTEM>_<SUBSYSTEM>_...` 命名模式适合手工管理的文档库。本组的配置项已有路径和 Git 对象 ID 作唯一标识，不再额外编号；最终清单 `config-items.json` 为每个文件记录路径、类别和 blob ID，可以无歧义地指出某个文件的某个版本。

### 3.3 分支

主干开发加短期任务分支，命名 `<type>/<member>/<需求编号>-<slug>`，通过 PR 以 merge commit 合入 `main`，保留分支内原提交。不设 `develop` 或 `release` 长期分支：候选版本直接在 `main` 上打 rc tag，发现问题在新分支修复后重新合入再打下一个 rc。

## 4. 变化控制

### 4.1 基线建立前

课件指出，配置项成为基线前只需非正式的变化控制。本组在 `v1.0.0-rc.1` 之前采用仓库现有流程：

1. 变更先在 [backlog](product-specs/backlog.md) 登记需求或缺陷编号。
2. 从最新 `main` 拉任务分支修改，提交信息使用 Conventional Commits 并写 `Refs: <编号>`。
3. 提交前运行 `make ci`；行为变化涉及的文档在同一 PR 中更新。
4. 发起 PR，CI 通过且至少一名非作者成员评审后合入。

### 4.2 基线建立后

从 `v1.0.0-rc.1` 起，对已进入基线的配置项实施项目级变化控制，对应课件的“评估—审阅—修改—提交”四步：

| 步骤 | 本组做法 | 记录位置 |
| --- | --- | --- |
| 评估（变化报告） | 在 backlog 新增 `BUG-xxx` 或 `US-xxx`，说明问题、影响的配置项、是否影响数据库迁移或接口契约 | backlog、PR 描述 |
| 审阅（工程变化命令） | 受影响配置项的主责人确认是否修改；跨模块或改动契约、迁移时由倪成锦评审，必要时写 ADR | PR 评审意见、ADR |
| 修改与质量检查 | 任务分支修改，补回归测试，`make ci` 通过；冯海伦对涉及验收条件的修复做复测 | 测试报告第 7 节、history |
| 提交与版本控制 | merge commit 合入 `main`，打下一个 rc tag 或 `v1.0.x`；被修改文档提升版本号并补变更记录 | tag、文档变更记录 |

以下变更不进入基线：已应用的迁移文件不得修改，只能新增迁移；已打出的 tag 不得移动或删除重建，有问题时发布新版本。

## 5. 配置审计

每次打 rc tag 或最终 tag 前，由范昭按下表逐项检查，倪成锦复核。课件中的“正式技术复审”对应 PR 评审和测试报告复核，本表是在其基础上补充的配置审计。

| 检查项 | 方法 | 通过标准 |
| --- | --- | --- |
| 自动门禁 | `make ci`，并核对 tag 所在提交的 GitHub CI 记录 | 本地与远程均通过 |
| 制品与源码一致 | `make release-package` 后核对 `release-manifest.json` | `git_sha` 等于 tag 指向的提交；`worktree_dirty` 为 `false` |
| 制品可独立构建 | `RELEASE_VERIFY_BUILD=1 make release-package` | 解包后的目录中锁定安装与完整构建通过 |
| 配置项完整 | 查看 `config-items.json` 的分类统计 | 13 类中除确实无文件的类别外均有条目；迁移列表与 `migrations/` 目录一致 |
| 无私有信息 | CI 中的仓库卫生检查；人工抽查制品是否含 `.env`、`.local` | 均不存在 |
| 文档版本一致 | 对照第 2.2 节表格，核对文档头版本与变更记录 | 版本号已更新，没有“待合入”等过时状态 |
| 需求可追溯 | 核对 [追溯矩阵](product-specs/traceability.md) | 每个必做需求有 PR、测试证据和发布 tag |
| 测试结论一致 | 核对测试报告与验收账本 | 报告结论与账本状态一致，未测项如实列出 |
| 跨机复现 | 在另一台机器上按 [运行说明](DEVELOPMENT.md) 从制品启动 | 记录机器环境、步骤和结果 |

审计结果写入第 8 节状态报告；未通过的项不得用说明代替，必须修复后重新审计或在交付说明中明确列为未完成。

## 6. 配置状态报告

课件要求状态报告回答“发生了什么、谁做的、何时发生、有什么影响”。本组的四项信息分别来自：

| 问题 | 来源 |
| --- | --- |
| 发生了什么 | 提交信息、PR 标题与描述、`docs/histories/` 变更记录 |
| 谁做的 | 提交 Author 与 `Co-authored-by`、PR 创建者与评审人；口径见 [团队分工](TEAM_ROLES.md) 第 4 节 |
| 何时发生 | 提交时间、PR 合入时间、tag 时间 |
| 有什么影响 | 关联的需求编号、追溯矩阵、[发布记录](releases/feature-release-notes.md) |

常用查询：`git log --first-parent --oneline main` 查看合入批次，`git log --graph --oneline --all` 查看完整提交图，`git tag -n` 查看基线。每次建立基线时在第 8 节追加一行状态摘要。

## 7. 最终配置库

### 7.1 组成

最终配置库由 `v1.0.0` tag 及其发布制品组成。推送 tag 后 [release workflow](../.github/workflows/release.yml) 自动生成以下文件并附在 GitHub Release 上：

| 文件 | 内容 |
| --- | --- |
| `wylie-college-source.tgz` | tag 所在提交的全部版本化文件，即全部配置项；顶层目录名含版本号 |
| `release-manifest.json` | 提交 SHA、tag、生成时间、运行时要求、数据库迁移列表、配置项分类统计，以及制品的大小与 SHA-256 |
| `config-items.json` | 每个配置项的路径、类别和 Git blob ID |
| `sbom.spdx.json` | 依赖物料清单（SPDX） |
| build provenance | GitHub 对源码包生成的来源证明，可用 `gh attestation verify` 校验 |

配置库交付源码包而不是构建好的程序，原因是：Prisma 查询引擎随操作系统不同，直接打包某台机器上的 `node_modules` 和构建产物，换到 Windows 或其他架构就不能运行。按锁文件安装再构建，结果由源码和锁文件唯一确定，第 5 节的独立构建检查用来证明这一点。

本地预演用 `make release-package`，产物写入被忽略的 `dist/`。脚本只打包已提交的提交，未提交的修改不会进入制品，并在 manifest 中标记 `worktree_dirty: true` 以免误用。

### 7.2 接收者使用步骤

1. 校验：对比 `wylie-college-source.tgz` 的 SHA-256 与 manifest 中的值。
2. 解包后按 [运行说明](DEVELOPMENT.md) 准备 Node.js 22 与 PostgreSQL 15。
3. `npm ci`、`npm run env:local` 生成本机配置、`npm run db:generate`、`npm run db:migrate`、`npm run db:seed`。
4. 演示账号初始密码在 `.local/demo-credentials.json`，首次登录需改密。

### 7.3 课程提交

课程提交时附 `v1.0.0` 的源码包、manifest 与配置项清单，并在提交说明中写明 tag 和提交 SHA。各课程文档的提交版按课程封面模板整理，内容以该 tag 中的版本为准。

### 7.4 运行数据备份与恢复

运行数据不在配置库中，但演示和验收前需要能保存与恢复某一时刻的状态。以下步骤尚未演练，首次跨机复现时一并验证后再更新本节：

- 数据库：`pg_dump --format=custom` 导出，`pg_restore --clean --if-exists` 恢复到同一迁移版本的空库；Compose 环境在容器内执行。
- 外部模拟：停止模拟进程后复制 `SIM_STATE_PATH` 指向的状态文件，恢复时放回原路径再启动。
- 凭据：`.local/` 下的凭据文件与数据库备份成对保存，二者不匹配时演示账号无法登录。备份文件含个人信息和密码，不放进仓库或公开位置。

## 8. 配置状态记录

| 日期 | 基线或状态 | 提交 | 摘要 |
| --- | --- | --- | --- |
| 2026-10-08 | 尚无基线 | `main` 为 [b3125f4](https://github.com/Nichengjin/software-engineering-project/commit/b3125f4) | `main` 共 99 个提交，PR #6—28 已以 merge commit 合入；4 个数据库迁移；无 tag。本计划为草案，发布脚本已改为打包完整源码，rc 与最终基线尚未创建 |

## 9. 待办

- [ ] 范昭审定本计划，倪成锦评审，修改后升为 v1.0。
- [ ] 打 `v1.0.0-rc.1`，在另一台机器（优先 Windows）按第 7.2 节完成复现，补全第 7.4 节演练结果。
- [ ] 完成第 5 节审计并记录结果，团队确认后打 `v1.0.0`。
- [ ] 第 2.2 节版本列和第 8 节状态记录随最终基线更新。

## 10. 变更记录

| 日期 | 版本 | 内容 |
| --- | --- | --- |
| 2026-10-08 | v0.1 | 依据课件 9.5 与仓库现有 Git、CI、发布流程起草；发布脚本改为打包 tag 对应的全部配置项并生成配置项清单 |
