## [2026-09-09 12:00] | Task: 补齐迭代增量 / 敏捷 + 持续交付流程

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-fable-5-1`
- **Runtime**: `Claude Code CLI`

### 📥 User Query

> 希望课设项目的架构符合主流开发模型。确认现有模板最接近迭代增量 / 敏捷 + DevOps 而非瀑布后，要求把模板补齐得更像这一模型，并更新 AGENTS.md、CLAUDE.md、README.md 写清团队成员的工作流程。

### 🛠 Changes Overview

**Scope:** docs、scripts、.github、Makefile、入口文档

**Key Actions:**

- **[迭代]**: 新增 `docs/ITERATION_GUIDE.md`、`docs/iterations/` 总览与模板，定义 1 到 2 周迭代的计划、日常、评审、回顾四个环节。
- **[需求与追溯]**: 新增 `backlog.md`、用户故事模板、`traceability.md`，确立 `US-` / `BUG-` / `ADR-` / `IT-` 编号体系。
- **[完成定义]**: `CONTRIBUTING.md` 单列 Definition of Done，PR 模板改为按完成定义勾选并强制填需求编号。
- **[测试与 Git]**: 新增 `docs/TESTING.md` 和 `docs/GIT_WORKFLOW.md`，定义测试分层、主干开发、Conventional Commits、语义化版本。
- **[ADR]**: 新增 ADR 模板与索引目录。
- **[CD]**: `release.yml` 改为 `v*` tag 推送自动触发并生成 release notes，manifest 记录 tag；新增 `dependabot.yml`。
- **[脚手架]**: 新增 `make new-iteration` / `new-spec` / `new-adr`，自动递增编号；新增必备文件全部加入 `check-docs.sh` 与 `check-repo-hygiene.sh`。
- **[入口]**: 重写 `AGENTS.md`、`CLAUDE.md`、`README.md`，README 给出需求到发布的五步主线和文档地图。

### 🧠 Design Intent (Why)

现有模板已有活文档、小 PR、常驻 CI 等迭代模型特征，但缺迭代节奏、需求追溯链和事件驱动发布。补齐这三块即可让模板对齐教科书意义上的迭代增量 / 敏捷 + 持续交付，且不绑定技术栈。所有新增约束都同时落成机械检查，符合模板"能检查就不要只口头约定"的原则。

### 📁 Files Modified

- `AGENTS.md`、`CLAUDE.md`、`README.md`、`CONTRIBUTING.md`、`Makefile`
- `docs/ITERATION_GUIDE.md`、`docs/TESTING.md`、`docs/GIT_WORKFLOW.md`、`docs/PLANS_GUIDE.md`、`docs/CICD.md`、`docs/QUALITY_SCORE.md`、`docs/REPO_COLLAB_GUIDE.md`
- `docs/iterations/`、`docs/product-specs/`、`docs/design-docs/adr/`、`docs/design-docs/templates/adr.md`
- `docs/exec-plans/completed/2026-09-09-agile-devops-process.md`
- `.github/workflows/release.yml`、`.github/dependabot.yml`、`.github/PULL_REQUEST_TEMPLATE.md`
- `scripts/new-iteration.sh`、`scripts/new-spec.sh`、`scripts/new-adr.sh`、`scripts/check-docs.sh`、`scripts/check-repo-hygiene.sh`、`scripts/release-package.sh`
