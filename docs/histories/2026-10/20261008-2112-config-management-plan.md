## [2026-10-08 21:12 Asia/Shanghai] | Task: US-029 起草配置管理计划并改造发布打包

### 🤖 Execution Context

- **Agent ID**: Claude Code（Claude Agent SDK）。
- **Base Model**: Claude Opus 5.5（`claude-opus-5-5`）。
- **Runtime**: macOS、Node 22、npm 10；倪成锦发起并负责，Agent 起草与执行。

### 📥 User Query

> 之前核对课程交付项时提到还差“软件配置管理计划与最终配置库”，开始起草吧。

### 🛠 Changes Overview

**Scope:** 课程配置管理文档、发布打包脚本与 workflow、仓库卫生检查、需求登记及关联文档。

**Key Actions:**

- **[登记需求]**: backlog 新增 US-029（P1，课程可选项，本组计划提供），归入 IT-04；同步迭代、北极星、开发计划和团队分工，主责仍为范昭。
- **[起草计划]**: 新建 `docs/CONFIG_MANAGEMENT_PLAN.md` v0.1，按课件 9.5 的标识、版本控制、变化控制、配置审计、状态报告五项任务组织；配置项分 13 类，列出不入库的私有配置与运行数据；版本命名为 `v1.0.0-rc.N` 候选与 `v1.0.0` 最终基线；规定基线后的变化控制和逐项审计表。
- **[改造打包]**: `scripts/release-package.sh` 由只打包文档的模板占位改为 `git archive` 打包 HEAD 全部版本化文件；新增 `scripts/release-manifest.mjs` 生成含提交 SHA、运行时、迁移列表和制品 SHA-256 的 manifest，以及逐文件的 `config-items.json`；`RELEASE_VERIFY_BUILD=1` 时在临时目录解包并锁定安装、构建。
- **[发布流水线]**: `release.yml` 增加 setup-node（沿用 CI 中已 pin 的 SHA），打包时验证解包构建，上传新制品与配置项清单，带后缀 tag 标为预发布。
- **[卫生检查]**: `check-repo-hygiene.sh` 增加检查，`.env`（示例除外）、`.local/`、`tmp/` 被提交时 CI 失败。
- **[文档同步]**: 更新 CICD、供应链安全说明中过时的模板制品描述；AGENTS 导航与 `check-docs.sh` 必需文件加入本计划。

### 🧠 Design Intent (Why)

此前发布脚本只打包文档和脚本，不含 `apps`、`packages` 和锁文件，按它打出的包不能作为最终配置库。制品选源码包而不是构建产物：Prisma 查询引擎随平台不同，打包本机 `node_modules` 换到 Windows 无法运行；用解包后锁定安装加构建的检查证明源码包本身可复现。配置项清单由脚本按规则自动生成，避免手工清单与实际文件脱节。计划以仓库已有的 Git、PR、CI 流程为基线前的非正式控制，只对 rc 之后的基线补正式控制和审计，不另造平行流程。

### ✅ Verification

- 新增 `scripts/release-manifest.test.ts` 3 项通过：分类规则、含空格与中文路径的解析、当前提交全部文件都能归类。
- `make release-package` 实际运行：manifest 指向基线 `b3125f4`，318 个配置项分入 13 类，4 个迁移；制品不含 `.env`（示例除外）、`.local`、`node_modules`。
- `RELEASE_VERIFY_BUILD=1` 实际运行：临时目录解包后 `npm ci`、Prisma generate 与全部 workspace 构建通过。网络较慢，本次加 `npm_config_prefer_offline=true` 优先使用本机 npm 缓存，安装内容仍由锁文件确定。
- 本机临时启动已有的 PostgreSQL 15 本地集群后 `make ci` 通过：文档、卫生、Action pinning 检查，类型检查，14 个测试文件 218 项（含真实 PG 集成），全部构建；跑完即停止数据库。
- 卫生检查负向验证：强制暂存 `tmp/` 下文件时检查失败并列出该文件，撤销后恢复通过。

### 🚧 Not Done

范昭尚未审定计划；未打任何 tag，release workflow 的新流程没有在 GitHub 上实际运行；跨机复现和备份恢复步骤未演练；未提交、推送或创建 PR。

### 📁 Files Modified

- `docs/CONFIG_MANAGEMENT_PLAN.md`
- `scripts/release-package.sh`
- `scripts/release-manifest.mjs`
- `scripts/release-manifest.test.ts`
- `scripts/check-repo-hygiene.sh`
- `scripts/check-docs.sh`
- `.github/workflows/release.yml`
- `docs/CICD.md`
- `docs/SUPPLY_CHAIN_SECURITY.md`
- `AGENTS.md`
- `docs/product-specs/backlog.md`
- `docs/product-specs/traceability.md`
- `docs/releases/feature-release-notes.md`
- `docs/iterations/IT-04-verification-and-delivery.md`
- `docs/NORTH_STAR.md`
- `docs/PROJECT_DEVELOPMENT_PLAN.md`
- `docs/TEAM_ROLES.md`
