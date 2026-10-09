# CI/CD 说明

CI 已接入 npm workspaces／Node 22／TypeScript／Vitest／真实 PostgreSQL 15；发布流水线打包 tag 对应的全部配置项作为最终配置库，未部署真实系统。运行环境见 [开发说明](DEVELOPMENT.md)。

## 默认包含的内容

- `ci.yml`：PR／main 使用 SHA 固定的 checkout／setup-node，`npm ci`；disposable PG15 service 后运行 `scripts/ci.sh`，保留 docs、hygiene、shell／Action pinning，加 Prisma generate／test migrations、strict typecheck、全量 Vitest 和三个 app build；Markdown 排除 node_modules。
- `supply-chain-security.yml`：public PR 使用 Dependency Review；本 private 仓库缺少该能力，使用全量 lockfile 的 npm high／critical 门禁，见 [供应链边界](SUPPLY_CHAIN_SECURITY.md)。保留 PR、定时任务和手动触发的 OSV 全量扫描，不静默放过扫描失败。
- `release.yml`：推送 `v*` tag 时自动触发，也支持手动触发。用 `git archive` 打包 tag 对应提交的全部版本化文件，在临时目录解包后按锁文件安装并完整构建；生成配置项清单、SBOM 和 provenance，并创建 GitHub Release。带后缀的 tag（如 `v1.0.0-rc.1`）标为预发布。规则见 [配置管理计划](CONFIG_MANAGEMENT_PLAN.md) 第 7 节。
- `dependabot.yml`：每周一为 GitHub Actions 提升级 PR。接入技术栈后追加对应的依赖生态。

## 持续交付流程

1. 开发者在功能分支提交，PR 触发 `ci.yml` 和 `supply-chain-security.yml`。
2. CI 通过且评审通过后使用 merge commit 合入 `main`，保留分支原提交；`main` 上再次运行 `ci.yml`。远程合并选项及线性历史规则需按 Git 工作流经授权配置，文档更新不表示设置已经改变。
3. 迭代评审通过后，release 负责人在 `main` 上打 `vX.Y.Z` tag 并推送。
4. `release.yml` 自动产出制品、SBOM、provenance 与 GitHub Release。

分支、版本号和打 tag 的具体约定见 `docs/GIT_WORKFLOW.md`。

## 设计原则

这套默认流水线的目标，是在项目真正成形前先把交付链路搭起来，而不是假装已经知道未来项目该怎么 build 和 deploy。

`scripts/release-package.sh` 已由模板占位逻辑改为本项目的最终配置库打包（US-029）；后续调整交付方式时继续修改这个脚本，而不是另起一套平行流程。

所有 GitHub Actions 都已经 pin 到 commit SHA。后续升级 action 时，也要继续保持这个约束。Dependabot 的升级 PR 也会保留 SHA 形式。

CI 的 `wylie_test` 是 runner 专用临时数据库，只在隔离 runner 中使用 trust 身份验证，没有共享密码或持久化卷；开发／演示 PG 则生成随机 SCRAM 密码且只绑定 loopback。workflow 的 `DATABASE_URL` 只用于测试隔离比较，CI 不迁移、seed 或 reset 开发／生产库。测试缺 PG 不 skip，数据库失败应让 job 红。

当前完整候选已本地验证 locked install、Prisma client、PG15 迁移、134 项测试、strict typecheck 与全部应用构建。GitHub 检查已实际运行；合入前逐项核对当前 head 的检查，早期阶段的基础 CI 不等于 #23 的完整业务 CI。远程结果以具体 run 为准，不能把本地通过记为 GitHub CI 通过。

## 推荐接入顺序

1. 保留 `ci.yml`，作为唯一默认常驻的仓库基础门禁。
2. 在 `scripts/ci.sh` 里叠加项目自己的 lint、单元测试、集成测试和覆盖率门禁，命令与 `docs/TESTING.md` 保持一致。
3. 在 `dependabot.yml` 里追加项目依赖的 package-ecosystem。
4. 用真实制品替换 `scripts/release-package.sh`（本项目已完成，见上文）。
5. 技术栈和环境稳定后，再补具体的部署 job（例如构建容器镜像推送到 GHCR、部署到测试环境）。
6. 即使交付方式变化，SBOM 和 provenance 这类供应链能力也建议保留。

## 默认 release 产物

当前 release 流水线会产出：

- `wylie-college-source.tgz`：tag 对应提交的全部版本化文件，不含 `.env`、`.local`、`node_modules` 等被忽略内容
- `release-manifest.json`：提交 SHA、tag、运行时要求、数据库迁移列表、配置项分类统计和制品 SHA-256
- `config-items.json`：每个配置项的路径、类别和 Git blob ID
- `sbom.spdx.json`
- 对源码包生成的 GitHub artifact attestation

制品是源码而不是构建产物，因为 Prisma 查询引擎随平台不同；流水线中的解包构建验证保证源码包加锁文件能独立构建。本地可用 `make release-package` 预演，加 `RELEASE_VERIFY_BUILD=1` 同时做解包构建验证。截至 2026-10-08 仓库尚未推送任何 tag，流水线的新打包方式还没有在 GitHub 上实际运行。
