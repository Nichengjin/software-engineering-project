# ADR-001：采用 React、TanStack Router、Hono、Prisma 与 PostgreSQL

- 日期：2026-09-22。
- 状态：已接受。
- 关联需求／迭代：US-019／IT-01。
- 决策依据：项目负责人在本项目讨论中的明确选择、对非 Next.js 前端方案的选型授权，以及对使用 TanStack Router、当前不采用 TanStack Start 的确认。
- 记录范围：技术选型已确定；总体设计、软件安装、业务实现与课程验收尚未完成。US-019 的文档交付仍需按仓库流程评审、合入。

## 背景

项目采用迭代增量开发，需要将软件工程课程中的需求、UML 建模、代码和测试联系起来。项目负责人熟悉 SQL 和 PostgreSQL，明确使用 React，倾向 TypeScript 与 Prisma，并选择 StarUML 进行建模。

负责人希望项目体现自身的设计判断，同时要求选型收敛，避免为了技术组合差异不断引入陌生工具。2026-09-22 明确确定 Hono 后端，并排除 Next.js；其余前端方案授权按项目需要选择。

## 决策

| 部分 | 选择 | 依据与职责 |
| --- | --- | --- |
| 主语言 | TypeScript | 沿用已讨论的类型设计方向；后续工程配置启用严格类型检查 |
| 前端界面 | React，单页应用（SPA） | 构建学生、教授和教务员界面，业务请求交给 Hono 后端 |
| 前端开发与构建 | Vite | 提供前端开发服务器与构建工具 |
| 前端路由 | TanStack Router | 组织页面导航、嵌套路由、类型安全的路由参数与查询参数，以及路由数据加载 |
| 后端 | Hono | 负责人明确指定，作为业务 HTTP API 入口 |
| 数据访问 | Prisma | 保留负责人偏好的 ORM；描述持久化模型、关系和数据访问，不因绘制类图更换 ORM |
| 数据库 | PostgreSQL | 负责人明确偏好且熟悉 SQL |
| UML 建模 | StarUML | 负责人选择的建模工具，用于维护领域与软件设计模型 |

Next.js 不属于本项目技术方案。NestJS、其他 ORM 及 Effect 等讨论过的替代方案不进入当前基线；原因是选型已收敛，当前没有项目需求要求承担额外迁移或学习成本。

Vite 是开发与构建工具，React 负责界面；这里选定的是前端应用方案，不将 Vite 描述为全栈框架。Vite 官方提供 React + TypeScript 模板；Hono 的运行平台与各工具具体版本在脚手架阶段核对兼容性并锁定，本记录不虚构已安装版本。

## TanStack Router 与 TanStack Start 的取舍

本项目确定使用 **React + TypeScript + Vite + TanStack Router**，当前不采用 **TanStack Start**。

TanStack Router 负责前端路由。TanStack Start 在 Router 基础上提供完整框架能力，包括服务端渲染、服务端函数及客户端／服务端构建；Start 也支持 SPA 模式。两者的区别见 [Start 官方概述](https://tanstack.com/start/latest/docs/framework/react/overview) 与 [SPA 模式说明](https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode)。

当前需求围绕登录后的选课、教学和教务操作展开，尚无明确的服务端渲染或搜索引擎收录需求；业务 API 已由 Hono 承担。因此当前方案用 Router 满足页面组织与类型检查需求，不再增加 Start 的服务端层。若后续出现确切的服务端渲染需求，再通过 ADR 评估调整。

技术职责关系为：浏览器中的 React 页面与 TanStack Router → Hono 业务 API → 服务端业务模块 → Prisma → PostgreSQL。Vite 负责前端开发与构建，StarUML 用于维护模型。这里仅确定职责边界，进程部署、数据模型和具体接口仍由总体设计细化。

## 对后续设计的约束

- 前端通过业务 API 与后端通信，Prisma 和数据库访问位于服务端。
- TanStack Router 负责页面导航与路由数据加载；Hono 路由负责 HTTP 请求与响应边界。选课、调剂、成绩和计费等业务行为在可独立测试的模块中定义。
- 前端的路由访问控制服务于界面交互，角色和数据所有权检查必须在后端执行。
- TypeScript 类型检查、运行时输入验证、业务规则和数据库约束各自承担职责；选择 Prisma 不意味着并发名额与事务一致性已解决。
- StarUML 中的领域类图表达概念、关系和约束；设计类图进一步表达服务、接口及职责。Prisma 模型表达持久化结构，二者建立映射，不要求每个设计类对应一张表。
- 保留需求、模型、迁移、代码与测试之间的追溯。具体 UML 图、数据模型和接口契约由总体设计继续完成。

## 后果与未覆盖事项

技术栈已经可以支撑后续总体设计。团队需要遵循统一的模块和类型边界；Hono 本身不替团队定义全部业务分层，Prisma 也不替代领域规则。

前端路由已确定为 TanStack Router。前端组件库、状态管理、认证、校验、测试和部署工具，以及包版本与运行环境尚未选定；在对应设计或脚手架需要时再确定。

项目按 Web 单页应用设计，但题目 Windows 桌面／95/98 要求的课程解释尚未得到教师确认，继续通过需求分析 Q-01 跟进。旧课程目录与计费系统是否允许模拟等业务边界也保持原有待确认状态。

## 文档验收条件

1. 明确记录 React、TypeScript、Vite、TanStack Router、Hono、Prisma、PostgreSQL、StarUML，以及单页应用方式。
2. 明确排除 Next.js，解释当前采用 Router、不采用 Start 的原因，区分已定技术栈与未完成的总体设计、工具配置和课程确认。
3. 架构入口、开发计划、需求分析与 IT-01 引用一致；关联 US-019 可追溯。

## 参考

- [Vite 官方入门文档](https://vite.dev/guide/)：开发、构建职责与 React TypeScript 模板。
- [TanStack Router 官方概述](https://tanstack.com/router/latest/docs/framework/react/overview)：类型安全路由、查询参数与数据加载职责。
- [Hono 官方 Node.js 适配说明](https://hono.dev/docs/getting-started/nodejs)：可供后续运行环境选型参考；本记录尚未锁定运行平台与版本。
