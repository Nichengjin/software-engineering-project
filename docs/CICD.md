# CI/CD 说明

CI 已接入 npm workspaces／Node 22／TypeScript／Vitest／真实 PostgreSQL 15；CD 仍是模板制品骨架，未部署真实系统。运行环境见 [开发说明](DEVELOPMENT.md)。

## 默认包含的内容

- `ci.yml`：PR／main 使用 SHA 固定的 checkout／setup-node，`npm ci`；disposable PG15 service 后运行 `scripts/ci.sh`，保留 docs、hygiene、shell／Action pinning，加 Prisma generate／test migrations、strict typecheck、全量 Vitest 和三个 app build；Markdown 排除 node_modules。
- `supply-chain-security.yml`：在 PR 上做依赖变更检查，并在 PR、定时任务和手动触发时运行 OSV 扫描。
- `release.yml`：推送 `v*` tag 时自动触发，也支持手动触发。打包仓库级制品、生成 SBOM 和 provenance，并创建 GitHub Release，自动生成 release notes。
- `dependabot.yml`：每周一为 GitHub Actions 提升级 PR。接入技术栈后追加对应的依赖生态。

## 持续交付流程

1. 开发者在功能分支提交，PR 触发 `ci.yml` 和 `supply-chain-security.yml`。
2. CI 通过且评审通过后使用 merge commit 合入 `main`，保留分支原提交；`main` 上再次运行 `ci.yml`。远程合并选项及线性历史规则需按 Git 工作流经授权配置，文档更新不表示设置已经改变。
3. 迭代评审通过后，release 负责人在 `main` 上打 `vX.Y.Z` tag 并推送。
4. `release.yml` 自动产出制品、SBOM、provenance 与 GitHub Release。

分支、版本号和打 tag 的具体约定见 `docs/GIT_WORKFLOW.md`。

## 设计原则

这套默认流水线的目标，是在项目真正成形前先把交付链路搭起来，而不是假装已经知道未来项目该怎么 build 和 deploy。

当新项目的技术栈确定后，你应该把 `scripts/release-package.sh` 里的占位打包逻辑替换成真实构建产物，而不是另起一套平行流程。

所有 GitHub Actions 都已经 pin 到 commit SHA。后续升级 action 时，也要继续保持这个约束。Dependabot 的升级 PR 也会保留 SHA 形式。

CI 的 `wylie_test` 是 runner 专用临时数据库，只在隔离 runner 中使用 trust 身份验证，没有共享密码或持久化卷；开发／演示 PG 则生成随机 SCRAM 密码且只绑定 loopback。workflow 的 `DATABASE_URL` 只用于测试隔离比较，CI 不迁移、seed 或 reset 开发／生产库。测试缺 PG 不 skip，数据库失败应让 job 红。

当前底座已本地验证 locked install、Prisma client、PG15 迁移与集成测试；GitHub workflow 尚未远程执行，不能把本地通过记为 GitHub CI 通过。完整 app build／业务测试需先集成对应 app 源码，入口缺失会显式失败。

## 推荐接入顺序

1. 保留 `ci.yml`，作为唯一默认常驻的仓库基础门禁。
2. 在 `scripts/ci.sh` 里叠加项目自己的 lint、单元测试、集成测试和覆盖率门禁，命令与 `docs/TESTING.md` 保持一致。
3. 在 `dependabot.yml` 里追加项目依赖的 package-ecosystem。
4. 用真实构建产物替换 `scripts/release-package.sh`。
5. 技术栈和环境稳定后，再补具体的部署 job（例如构建容器镜像推送到 GHCR、部署到测试环境）。
6. 即使交付方式变化，SBOM 和 provenance 这类供应链能力也建议保留。

## 默认 release 产物

当前 release 流水线会产出：

- `release-manifest.json`（包含 release tag 与 git sha）
- `repo-metadata.tgz`
- `sbom.spdx.json`
- 对 release artifact 生成的 GitHub artifact attestation

也就是说，即使项目还没进入真实部署阶段，这个模板也已经把"可追溯的制品封装"这一步准备好了。
