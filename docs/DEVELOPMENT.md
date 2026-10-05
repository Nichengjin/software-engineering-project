# 本地开发与运行底座

关联 US-027／IT-02；模型和 HTTP 以 `docs/design-docs/system-design.md`、`api-contract.md` 为准。此文记录真实可执行的环境入口，不表示业务实现、独立验收或生产发布已经完成。

## 工具与 workspace

- Node.js 22 LTS（使用最新 22.x，Vite 要求至少 22.12；orb Node 26 也可运行），npm 10.9.9，TypeScript 5.9 strict。
- `@wylie/api`：Hono 4、Node adapter、pg、ExcelJS、yauzl；`src/server.ts` 为监听入口。
- `@wylie/web`：React 19、Vite 7、TanStack Router；浏览器请求 `/api` 同源代理到 API，不直接访问模拟服务。
- `@wylie/simulators`：独立 Hono HTTP 进程，3001；目录和计费状态不依赖业务数据库。
- `@wylie/db`：Prisma 6.19.3／PostgreSQL 15；`@wylie/contracts`：完整 DTO／Zod 3，导出编译后的 `dist`。
- 所有包共享根 npm lock；先 `npm ci`，再 `npm run db:generate`。build／typecheck／dev 自动先构建共享包；改 contracts 后重新构建共享包／重启 dev。

## Docker Compose 路径

需要本机已有 Docker Engine 与 Compose plugin。不要同时启动 Compose 和 orb PG 占用 5432。

```sh
npm ci
npm run env:local
docker compose up -d --wait postgres
docker compose exec postgres createdb -U wylie wylie_test
npm run db:generate
npm run db:migrate
npm run db:migrate:test
npm run db:seed
npm run dev
```

`createdb` 只需第一次执行；已存在会显式报错，不应删除重建。Compose 数据持久化于 named volume，不要用 `down -v` 清理已有数据。`env:local` 从 `.env.example` 只补缺失变量、生成每台机器独立的随机密码与密钥，保留已有配置；`.env` 与 `.local/postgres-password` 权限 600 且 ignored。部署或共享数据库不要使用本地生成脚本，应从受控配置注入 URL／凭据。

## 无 Docker 的 Amp orb 路径

```sh
.agents/setup
amp orb services ensure
npm run db:migrate
npm run db:migrate:test
npm run db:seed
make ci
```

`.agents/setup` 安装 locked npm 依赖、缺失时 apt 安装 PG15、在 `.local/postgres` 初始化独立集群及 `wylie`／`wylie_test`，生成 client 与共享包。不启动后台进程、不 seed、不 reset。重复执行保留数据库、配置及密码。首次 apt 安装需 sudo／网络；暖运行不再 apt update。

`.amp/services.yaml` 声明监督运行的 postgres 和 app；没有 PostgreSQL portal。app 的根 dev 同时启动 API 3000、模拟 3001、Vite 5173（或监督服务的 `$PORT`），API 的 child `PORT` 从 `API_PORT` 注入，模拟使用 `SIM_PORT`；根 `.env` 不设置共享 `PORT`。`PUBLIC_ORIGIN` 在 portal 中由 `PUBLIC_URL` 传入。API 启动准备／leader lock／恢复逻辑由 API 模块实现。

`amp orb services ensure` 返回的 portal 才能对用户分享；端口号与 loopback 地址只供 orb 内部工具使用。服务检查用 `amp orb service list`、`status <name>`、`logs <name>`；已有 manifest 的单个服务用 `amp orb service restart postgres`，不能再以 one-off `start postgres` 启动同名服务。停止用 `amp orb service stop <name>`，不用 nohup／后台 shell／tmux 守护服务。三个 app 源码已集成，统筹已实际启动 portal，并在 Node22／26 通过完整 `make ci`（108 tests、strict typecheck、全部 app build）；这不等于独立验收或生产部署。

本轮 orb 演示库已走完真实关闭与补选，当前学期是 CLOSED，不自动重开或 reset。原始随机凭据在 `.local/demo-credentials.json`；联测中已改密的账号以 `.local/review-credentials.json` 为准，均为 ignored、600 权限的私有文件，不随源码交付。冯海伦从初选开始验收时应使用独立空数据库和独立模拟状态，运行 seed 生成自己的凭据，不能复用本轮关闭后的状态推断初始结果。Docker 路径及另一台环境复现仍待测。

## 迁移、测试与虚构数据

| 命令 | 行为 |
| --- | --- |
| `npm run db:generate` | 从版本化 schema 生成 Prisma client |
| `npm run db:migrate` | 对 `DATABASE_URL` deploy 已提交 SQL 迁移；不 reset |
| `npm run db:migrate:dev -- --name <name>` | 本地开发新增迁移；只能对可丢弃开发库使用，审阅 Prisma 提示 |
| `npm run db:migrate:test` | 只对显式 `TEST_DATABASE_URL` deploy；要求 `_test` 后缀且不等同开发库 |
| `npm run db:seed` | 仅全新演示库初始化；有账户／学期就跳过，不覆写密码、记录或目录 |
| `npm run db:fixtures` | 从虚构源数据导出供独立模拟服务使用的目录 JSON，不含凭据 |
| `npm run typecheck` | strict 检查 source、seed、fixture、tests |
| `npm test` | 全量 Vitest，包括真实 PG，不可用直接失败 |
| `npm run test:unit` | 显式只跑非 `.integration.test.ts` |
| `npm run test:integration` | 真实 PG 集成（`.integration.test.ts`） |
| `npm run build` | 共享包→API／web／simulators 的生产构建 |

seed 只有虚构身份：14 学生、4 教授、1 教务；每人独立随机初始密码、16-byte salt，scrypt N=16384／r=8／p=1／64-byte hash。密码格式 `scrypt$16384$8$1$<salt hex>$<hash hex>` 与后端约定一致，首次登录需改密。明文只写 ignored `.local/demo-credentials.json`（600），不打印、不提交；重跑不轮换已有密码。数据库已有数据但凭据文件丢失时不会恢复或重置密码。

四学期包括上线前历史、上一已完成且为上线学期、当前初选、未来；稳定 term UUID 在 `packages/db/seed/fixtures.ts`／`catalog.json`。2026-10-05 演示当前学期 ordinal=3，初选截止 10-07 18:00 Asia/Shanghai、加退选 10-08—10-20 18:00；时钟越过窗口必须通过教务合法修改或在测试 factory 注入，不能改公共业务时钟。上一学期有 10 人名册、A／I／null 成绩、关闭结果／冻结目录、14 笔完整待发送账单（10 笔 300 元、4 笔零元）；其余不足三人班已取消。历史有先修及格／不及格；当前无预占名额。初始历史目录是演示镜像，之后目录权威归模拟服务。`DEMO_CREDENTIALS_PATH` 可为隔离 seed 复验指定另一个 ignored 私有文件；已有数据不因新 seed 文本升级而自动改变。

`SIM_SEED_PATH=packages/db/seed/catalog.json` 形状 `{catalogs:[{revision,termId,courses,offerings}]}`；root dev 传绝对路径。`SIM_STATE_PATH=tmp/simulators-state.json` 是独立 ignored 持久化状态。`SIM_CONTROL_ENABLED=false` 默认关闭测试控制；启用时使用独立 `SIM_CONTROL_TOKEN`，不公开到 SPA。外部访问用 `EXTERNAL_SERVICE_TOKEN`，impact／CSRF 签名分别用独立密钥。不得把初始密码、token 或真实 SSN 写入 fixture／日志。

SQL 迁移额外守住全角色 SSN、人员与 identity 一事务匹配、角色关联、唯一上线学期、时间／版本、课表墓碑、有效注册／当前授课唯一、通知 nullable 问题键去重与不可变 outbox payload。业务容量、先修、权限、准入／关闭等仍须 API 在同一事务验证；这些 SQL 约束不能替代业务规则。

## 依赖审计边界

2026-10-05 集中合入前修复两项传递依赖，不使用 `audit fix --force` 升级 Prisma 主版本。消费者限定的 overrides 与锁文件一起提交：

- Prisma 6.19.3 配置层的 deepmerge-ts 从 7.1.5 升到 8.0.2，修复 [GHSA-ggr8-5vv4-36mx](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx)。保留 Prisma6，已回归 client generate、真实迁移与 seed 测试；没有可执行 Prisma 配置的现有边界不变。
- ExcelJS 4.4.0 的 uuid 从 8.3.2 升到仍提供 CommonJS 的 11.1.1，修复 [GHSA-w5hq-g745-h8pq](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq)。ExcelJS 的零参数 uuid.v4 路径已通过条件格式导出／导入复验，真实 xlsx 业务测试亦通过；ZIP／公式／资源限额仍必须实施，不能视版本升级为整个 ExcelJS 已安全。

esbuild 的 Windows `serve/servedir` 文件读取问题通过兼容的 tsx 4.23.15→esbuild 0.28.x 更新修复，Vite 7.3.6 自身也允许 0.28；不全局强制旧 tsx 跨范围 override。本次 `npm ci`、`npm audit --package-lock-only --audit-level=high` 为 0 vulnerabilities，完整 `make ci` 为 134 tests passed／全部构建通过；扫描结果只反映当时已知漏洞，不代表零风险。详见 [检查修复 history](histories/2026-10/20261005-merge-checks.md)。

Vitest 已从有 redirect-mock 文件读取问题的 3.x 升到修复版本 4.1.11；若旧消费者仍报告 Vitest 漏洞，应更新根 lock 并 `npm ci`。npm 10 在从旧 Vitest lock 升级时曾遇 Arborist peer-resolution bug，本次用 npm 11.16.0 生成兼容 v3 lock 后，npm 10.9.9 的 `npm ci` 已验证；未来依赖升级可使用该命令生成 lock，但安装仍以 checked-in lock 为准。
