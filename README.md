# Wylie College 学生选课系统

软件工程课程设计项目，使用 React + TypeScript + Vite、Hono、Prisma 和 PostgreSQL。支持学生选课与成绩查询、教授授课与成绩录入、教务人员维护与关闭选课；课程目录和计费由独立 HTTP 模拟服务提供。

下面以**本机开发运行**为主，从克隆代码开始。运行指南不代表正式验收或生产发布；已执行的测试及限制见 [测试报告](docs/TEST_REPORT.md)。

## 1. 准备环境

请先安装以下工具：

| 工具 | 要求 | 用途 |
| --- | --- | --- |
| Git | 可在终端执行 `git` | 克隆代码 |
| Node.js | 推荐最新 Node.js 22 LTS，至少 22.12 | 运行前后端及开发工具 |
| npm | 项目使用 10.9.9 | 安装锁定依赖 |
| Docker 与 Docker Compose | Docker 已启动，支持 `docker compose` | 运行 PostgreSQL 15 |

macOS／Windows 可以使用 Docker Desktop。Windows 的下列命令可在 PowerShell 中逐行执行；macOS／Linux 使用终端。先确认工具可用：

```sh
git --version
node --version
npm --version
docker compose version
docker info
```

默认需要本机端口 **5432、3000、3001、5173** 空闲。已有 PostgreSQL 或其他项目占用端口时，先处理冲突，不要删除已有数据库。

## 2. 克隆代码并安装依赖

```sh
git clone https://github.com/Nichengjin/software-engineering-project.git
cd software-engineering-project
npm ci
```

之后的命令都在这个项目根目录执行。使用 `npm ci` 按 `package-lock.json` 安装，不需要在各个子目录分别安装。

## 3. 生成本地配置

```sh
npm run env:local
```

这个命令会生成根目录 `.env`，包含数据库连接、服务地址和随机密码／密钥；**不需要先手动复制 `.env.example`**。重复运行只补缺失变量，不覆盖已有值。

`.env`、`.local/` 下的密码与账号文件均为私有本地文件，不要提交到 Git 或分享给他人。如果你之前手动复制了示例配置，需自行替换其中的 `replace-with-…` 值，该命令不会替换已有配置。

## 4. 启动数据库并初始化数据

先启动 PostgreSQL：

```sh
docker compose up -d --wait postgres
```

首次初始化时，创建独立测试数据库（开发数据库 `wylie` 已由 Compose 自动创建）：

```sh
docker compose exec postgres createdb -U wylie wylie_test
```

`createdb` **只需执行一次**。若提示 `database "wylie_test" already exists`，说明已创建，跳过这一步即可，不要删除重建。

再生成数据库客户端、应用迁移并写入演示数据：

```sh
npm run db:generate
npm run db:migrate
npm run db:migrate:test
npm run db:seed
```

首次 seed 会生成 14 名学生、4 名教授和 1 名教务员的虚构数据，以及各账号独立随机的初始密码。数据库已有账号或学期时会跳过初始化，**不会重置数据或密码**。

## 5. 启动开发服务器并访问页面

```sh
npm run dev
```

保持这个终端运行。该命令先构建共享包，再同时启动三个服务，不必分别启动前后端：

| 服务 | 默认地址 | 用途 |
| --- | --- | --- |
| 前端页面 | <http://localhost:5173> | 在浏览器中使用系统，未登录时直接显示登录页 |
| 后端 API | <http://localhost:3000/api/health/ready> | 查看后端就绪状态，不是操作界面 |
| 目录／计费模拟服务 | <http://localhost:3001> | 供后端调用，不是用户操作界面 |

等待终端显示 Vite 的访问地址且没有启动错误，再打开 **<http://localhost:5173>**。前端的 `/api` 请求自动代理到后端。

以上地址适用于在同一台电脑上运行与访问。不要把开发服务器直接暴露到公网；远程 Amp orb 的访问方式见 [开发运行指南](docs/DEVELOPMENT.md#无-docker-的-amp-orb-路径)，使用工具返回的 portal 链接而不是本机 localhost 地址。

## 6. 获取演示账号并登录

在编辑器中打开 `.local/demo-credentials.json`，查看 `credentials` 数组：

- `account`：登录账号。
- `initialPassword`：初始密码。
- `role`：`STUDENT`（学生）、`PROFESSOR`（教授）、`REGISTRAR`（教务员）。
- `name`：虚构演示姓名。

在登录页填写 `account` 和 `initialPassword`，首次登录按提示修改密码。之后使用你设置的新密码，文件中的初始密码不会随之更新。演示数据中有停用的教授账号，如需体验教授功能，请选择启用的账号。

登录后按角色使用：

- **学生**：浏览课程目录，编排、保存与提交课表，查看成绩单。
- **教授**：选择授课班次，查看学生名册，录入成绩。
- **教务员**：维护或导入人员，设置学期时间，关闭选课、查看计费状态及处理补选。

演示学期使用真实日期窗口，过期后相关操作会被拒绝。需要演示选课时，先用教务账号核对并按业务规则调整学期阶段时间；不要修改电脑时钟。关闭选课会改变业务状态，不要为了试用随意关闭。具体规则见 [需求分析](docs/REQUIREMENTS_ANALYSIS.md)。

如果数据库已有数据但凭据文件丢失，重新 seed 不会恢复密码；请使用已保存的有效账号，不要通过删除数据库来“修复”登录问题。

## 7. 停止与再次启动

在运行 `npm run dev` 的终端按 **Ctrl+C**，停止前端、API 和模拟服务。数据库仍在后台运行；如需停止数据库：

```sh
docker compose stop postgres
```

下次继续开发，只需：

```sh
docker compose up -d --wait postgres
npm run dev
```

已有数据保存在 Docker volume 中。**不要执行 `docker compose down -v`**，它会删除数据库数据。模拟服务状态保存在 `tmp/simulators-state.json`，也不要随意删除。

拉取新代码后，按更新内容执行 `npm ci`、`npm run db:generate`、`npm run db:migrate` 和 `npm run db:migrate:test`，再启动开发服务器。修改共享 contracts 包后需重启 `npm run dev`，使共享包重新构建。

## 常见问题

| 现象 | 检查方式 |
| --- | --- |
| Docker 连接失败 | 确认 Docker Desktop／Docker Engine 已启动，`docker info` 能正常返回 |
| 5432 端口被占用 | 检查已有 PostgreSQL 或 Docker 容器，避免同时运行多个占用 5432 的数据库 |
| 数据库认证失败 | 检查 `.env` 与已有数据库密码是否一致；更改 `.env` 不会更改已初始化 volume 中的密码 |
| 页面打不开、端口被占用 | 检查开发终端是否仍在运行，以及 5173、3000、3001 是否被其他进程占用；Vite 不会自动换端口 |
| 页面打开但 API 请求失败 | 检查开发终端中的 API／模拟服务错误，并访问后端就绪地址；用 `docker compose ps` 检查数据库状态 |
| 登录失败 | 确认账号启用、密码是否已修改；重复 seed 不会重置密码 |
| 无法提交选课或选择授课 | 核对学期阶段、日期窗口、先修要求、容量与角色权限；保存课表不等于正式提交 |

默认 Vite 代理固定指向 API 的 3000 端口。如果调整 API 端口，还需同步 `apps/web/vite.config.ts` 的代理；调整前端端口也需同步 `.env` 中的 `WEB_ORIGIN`／`PUBLIC_ORIGIN`。首次运行建议保持默认配置。

## 验证与更多文档

数据库运行且已完成测试库迁移后，可在另一个终端执行：

```sh
npm run typecheck
npm test
npm run build
```

完整仓库门禁是 `make ci`（需要可用的 Make／Bash）。测试使用独立的 `TEST_DATABASE_URL`，不能指向开发库；详细说明见 [测试策略](docs/TESTING.md)。

| 想了解 | 文档 |
| --- | --- |
| 更多环境配置、无 Docker orb 路径 | [开发运行指南](docs/DEVELOPMENT.md) |
| 功能、权限与业务规则 | [需求分析](docs/REQUIREMENTS_ANALYSIS.md) |
| 技术架构与代码目录 | [架构总览](docs/ARCHITECTURE.md) |
| 模拟服务与故障控制 | [模拟服务说明](docs/SIMULATORS.md) |
| 团队协作、分支与提交 | [协作约定](docs/REPO_COLLAB_GUIDE.md)、[Git 工作流](docs/GIT_WORKFLOW.md)、[参与协作](CONTRIBUTING.md) |
| 迭代进度与成员职责 | [项目北极星](docs/NORTH_STAR.md)、[团队分工](docs/TEAM_ROLES.md) |

## 许可证

[MIT](LICENSE)。项目基于 [harness-template](https://github.com/iFurySt/harness-template) 的 Agent-first 协作模板。
