# 提交与成员任务分支计划

- 关联 US-002／IT-01 的协作与配置管理约定，执行跨 IT-02—04；不新增业务需求。
- 状态：2026-10-05 已从分析基线创建远程 `main`、推送 18 条任务分支并创建 PR #6—23。#6 待审，其余草稿；未审批、合并或发布。用户手动设置后已确认默认 main、仅允许 merge commit；成员接手脚本已准备，尚未代成员创建替代 PR。
- 输入：已完成的 [实现候选](2026-10-05-delivery-execution.md)、用户认可的 31 项提交内容及六人分工。人名／邮箱已由用户提供，邮箱仅登记于 ignored 私有文件，不在本文复制。
- 本表是后续组织工作和集中提交的计划，不是成员已经完成工作的记录；独立验收与评审仍需实际执行。

## 1. 分支和合并原则

`main` 为唯一长期主线；新分支格式为 `<type>/<member>/<us-id>-<slug>`。成员标识使用 `nichengjin`、`haoyu`、`mazhe`、`fenghaiyang`、`fanzhao`、`fenghailun`，无需与 GitHub 用户名相同。一个成员可以拥有多条任务分支，一个分支也可以保留多位实际作者的提交。分支名不是身份认证。

每条任务分支计划对应一个 PR，用 merge commit 保留原提交，不 squash、不 rebase merge。原会话中的 P01—P11 是工作包编号；跨属主的工作包拆为 a／b／c 子 PR。最初规划 21 条分支、31 项普通提交；本次只准备已存在的前 27 项，P10／P11a／P11b 及第 28—31 项等待独立测试与复现，未创建空分支或空提交。3 次本地依赖合并不是主干合并或已批准 PR，不与未来正式 PR 合并节点混算。

按用户后续确认采用堆叠分支：允许从尚未合入的前置任务 tip 创建后续分支，保留相同祖先提交；有多条必要前置时在任务分支内合并依赖。本轮 P03a／P04a 从共同底座分叉，P05b／P07a 从教授阶段分叉，不人为构造冲突。PR 已集中创建，按依赖分批转为待审；前置经 merge commit 合入后，再核对后续 PR 差异。前置审阅发生修改时，同步到所有依赖分支并重新测试。当前后续 PR 的 Files changed 包含尚未合入的前置，不可误当单任务净差异。

## 2. 分支、属主、依赖和提交归属

“前置”现在记录实际起点及依赖合并，不要求它们已经进入主干。顺序已按源码依赖修正：人员服务依赖课表服务；计费服务先于关闭；完整入口在 P09b，完整 CI 在 P09a。真实 PR 对照及设置限制见第 8 节。

| PR 规划号 | 任务属主 | 分支（P01—P09 已推送） | 提交序号 | 实际起点／依赖 |
| --- | --- | --- | --- | --- |
| P01 | 倪成锦 | `docs/nichengjin/us-026-design` | 1—3 | 已有分析／文档基线 |
| P02a | 范昭 | `chore/fanzhao/us-027-workspace` | 4 | P01 |
| P02b | 倪成锦 | `feat/nichengjin/us-026-data-contracts` | 5—6 | P02a |
| P02c | 范昭 | `chore/fanzhao/us-027-runtime-seed` | 7—8 | P02b |
| P03a | 倪成锦 | `feat/nichengjin/us-004-auth` | 9—10 | P02c |
| P03b | 浩宇 | `feat/haoyu/us-004-web-shell` | 11 | P03a |
| P04a | 范昭 | `feat/fanzhao/us-016-simulators` | 12—13 | P02c |
| P04b | 倪成锦 | `feat/nichengjin/us-005-catalog` | 14 | P03a、P04a |
| P05a | 倪成锦 | `feat/nichengjin/us-007-schedules` | 15 | P04b |
| P05b | 浩宇 | `feat/haoyu/us-006-student` | 16—17 | P06 |
| P06 | 马喆 | `feat/mazhe/us-009-teaching-grades` | 18—19 | P05a、P03b |
| P07a | 冯海洋 | `feat/fenghaiyang/us-023-people-imports` | 20—21 | P06（已含 P05a／P03b） |
| P07b | 冯海洋 | `feat/fenghaiyang/us-021-term-windows` | 22 | P07a |
| P08a | 倪成锦 | `feat/nichengjin/us-015-closing` | 23 | P08b |
| P08b | 范昭 | `feat/fanzhao/us-016-billing` | 24 | P07b |
| P08c | 冯海洋 | `feat/fenghaiyang/us-022-close-supplement` | 25 | P08a |
| P09a | 范昭 | `ci/fanzhao/us-027-checks` | 26；另附统筹收尾记录 | P09b |
| P09b | 倪成锦 | `feat/nichengjin/us-027-integration` | 27 | P08c、P05b |
| P10 | 冯海伦 | `test/fenghailun/us-018-acceptance` | 28—29（未创建） | 候选执行依赖 P09a；用例审核可提前 |
| P11a | 冯海伦 | `docs/fenghailun/us-018-test-report` | 30 | P10 实测及缺陷闭环 |
| P11b | 范昭 | `docs/fanzhao/us-027-delivery` | 31 | P11a、独立环境复现 |

P05b 包含成绩单页面，以已含公共层和教学服务的 P06 为基点；完整 HTTP 查询路由在 P09b 接通，不能把早期页面组件类型检查称为全链路验收。P07a 如超过一次合理审查范围，应再拆人员／导入两个 PR，而非为了保持 21 个分支强行合并。

## 3. 保留的 31 项提交计划

第 1—27 项已按用户指定的姓名／邮箱登记 Author，Committer 为实际整理者 Amp，并在正文注明集中整理 AI 辅助候选、尚未经成员复核／PR 评审，保留 `Refs`、AI 协作及线程来源。日期为本次实际提交时间（Asia/Shanghai），不回填开发日期。下表已同步实际拆分标题；第 28—31 项仍是后续计划。

| # | 拟提交人 | Commit message | 内容 | PR 规划号 |
| --- | --- | --- | --- | --- |
| 1 | 倪成锦 | `docs(plan): 明确设计到测试的执行计划与分工` | 执行计划、需求关联、成员任务分支与合并规范 | P01 |
| 2 | 倪成锦 | `docs(architecture): 定义总体架构与单实例一致性方案` | 总体设计、事务、准入、认证与 ADR | P01 |
| 3 | 倪成锦 | `docs(design): 补充领域设计图与关键交互模型` | 原生 UML 源模型、导出、模型说明 | P01 |
| 4 | 范昭 | `chore(workspace): 建立项目工作区与依赖基线` | workspace、lock、TypeScript 配置；本阶段只有安装／配置检查，不含可运行 app 入口 | P02a |
| 5 | 倪成锦 | `feat(contracts): 定义业务接口与共享数据契约` | 完整 DTO／Zod、契约测试及其依赖的共享 catalog fixture；API 文档随设计提交 | P02b |
| 6 | 倪成锦 | `feat(db): 建立业务数据模型与数据库约束` | Prisma、已有迁移及约束测试，不改已应用迁移内容 | P02b |
| 7 | 范昭 | `feat(seed): 提供虚构演示数据与随机初始凭据` | seed、目录 fixture、幂等及密码测试 | P02c |
| 8 | 范昭 | `chore(dev): 配置本地数据库与开发服务启动` | 环境示例、监督启动、脚本与开发说明 | P02c |
| 9 | 倪成锦 | `feat(auth): 实现密码派生与业务准入基础规则` | 密码、共享规则、准入与 7 项单元测试 | P03a |
| 10 | 倪成锦 | `feat(security): 实现持久化会话与请求安全校验` | session、CSRF、授权、运行上下文与外部适配 | P03a |
| 11 | 浩宇 | `feat(web): 建立登录交互与同源请求公共层` | SPA 公共层、登录、身份恢复、公共组件和请求测试；导航统一在集成提交接通 | P03b |
| 12 | 范昭 | `feat(simulators): 实现独立目录与版本化计费模拟` | 完整独立模拟服务及持久化状态 | P04a |
| 13 | 范昭 | `test(simulators): 验证幂等计费持久化与故障恢复` | 41 项真实 HTTP 测试及模拟使用说明 | P04a |
| 14 | 倪成锦 | `feat(catalog): 接入课程目录同步与变更处理` | 后端同步、有效性及通知测试 | P04b |
| 15 | 倪成锦 | `feat(schedules): 实现课表保存提交与名额校验` | 课表保存／提交／删除 API、版本墓碑、容量／先修／冲突测试 | P05a |
| 16 | 浩宇 | `feat(student): 实现课表编排提交与成绩单页面` | 保留同一文件内的选择、提交、删除、通知与成绩单组件，不为条数拆散函数 | P05b |
| 17 | 浩宇 | `test(student): 验证编辑版本与时间转换边界` | dirty 副本、迟到轮询和北京时间转换的 4 项测试 | P05b |
| 18 | 马喆 | `feat(teaching): 实现授课名册与逐项成绩服务` | 授课、名册、成绩服务模块 | P06 |
| 19 | 马喆 | `feat(grades): 实现教授授课名册与录分页面` | 教授端页面组件；API 路由与完整集成测试在 P09b 接通 | P06 |
| 20 | 冯海洋 | `feat(people): 实现人员维护与状态影响确认` | CRUD、停用、影响预览／确认及测试 | P07a |
| 21 | 冯海洋 | `feat(imports): 实现表格导入与逐行校验反馈` | 四类 xlsx、安全边界、逐行结果与测试 | P07a |
| 22 | 冯海洋 | `feat(terms): 实现学期窗口配置与版本化交互` | 窗口页面与版本化请求；窗口写事务位于统一 API 入口，在 P09b 接通 | P07b |
| 23 | 倪成锦 | `feat(closing): 实现关闭调剂与补选事务` | 准入排空、关闭与补选事务，依赖先提交的计费服务 | P08a |
| 24 | 范昭 | `feat(billing): 实现版本账单与发送重试服务` | 同事务账单、发送、重试与并发控制服务 | P08b |
| 25 | 冯海洋 | `feat(registrar): 实现关闭结果展示与关闭后补选` | 关闭／计费状态、补选交互与界面测试 | P08c |
| 26 | 范昭 | `ci(project): 接入类型检查数据库测试与构建` | 完整 CI 门禁、独立测试库与 app build | P09a |
| 27 | 倪成锦 | `feat(integration): 接通应用入口并记录三角色联调` | 完整 API／SPA 入口、恢复调度、29 项后端 PG 集成测试、详细设计与交接记录；先于最终 CI 提交 | P09b |
| 28 | 冯海伦 | `test(plan): 完善验收用例与独立测试数据方案` | 实际审核已有 Agent 初稿、补用例及独立数据；不重署初稿作者 | P10 |
| 29 | 冯海伦 | `test(acceptance): 补充权限并发与故障回归用例` | 独立测试产生的复现、自动化和回归用例 | P10 |
| 30 | 冯海伦 | `docs(test): 汇总验收结果与待处理缺陷` | 环境、实际通过／失败／未测、缺陷和回归报告 | P11a |
| 31 | 范昭 | `docs(delivery): 完善独立环境运行与交付说明` | 基于复现修订运行说明、配置及交付清单 | P11b |

补选服务归 P08a，补选页面归 P08c；成绩录入服务归 P06，学生展示归 P05b，成绩查询路由在 P09b 接通。初稿测试计划随第 1 项保留 Agent 来源；第 28 项只提交后续实际修订，没有修订就不产生空提交。第 29—31 项必须在相应工作发生后记录，不能提前填通过结果。

## 4. 并行、评审与共享文件

- P03a 与 P04a 可并行；P03b 与 P04b 可并行；其后教授、人员／窗口、学生界面按依赖推进。关闭和计费阶段复用此前规则；独立测试最后记录实际结果。
- 学生／教授／教务互相不覆盖页面文件；`apps/api/src/app.ts`、运行上下文、根 lock、前端导航和大集成测试等共享文件要按增量接入，由统筹协调。不能把最终入口提前放入缺模块的分支。
- 本轮逐提交检查已引入部分：设计阶段文档骨架／卫生，workspace 阶段安装／配置，后续 strict typecheck＋当前全部已有测试。统一入口之前不能完整启动所有 apps，也未对每个服务单独完成 HTTP 验收；P09b／P09a 已各自运行完整 108 tests 和全部 build。没有加占位入口或跳过失败测试来伪造可运行状态。
- 拟评审安排沿用 TEAM_ROLES：倪成锦工作由相关领域负责人评审；学生由倪成锦，教授由倪成锦／浩宇／冯海洋按子需求，教务由相关领域负责人，外部与运行由倪成锦，独立测试由倪成锦复核。评审人须不同于实际作者，未发生的评审不打勾。
- 本地 `--no-ff` 可预演拓扑，但不生成平台 PR。真实 PR 创建后把规划号映射到 URL；只有真实平台合并及检查才填入 traceability 的 PR／CI 栏。

## 5. 当前工作区的执行前置与回退

原本地 `feat/us-026-design-to-implementation` 仍保留候选工作区和未提交文件，未为拆分 checkout／reset。开始拆分前保存完整候选到仅本地恢复引用 `refs/backup/history-candidate-20261005`（不推送）。工作在独立 `history-stage` worktree 完成，保留现有 5 个提交。

本地步骤 1 开始时，`git ls-remote --heads origin main docs/us-024-object-analysis` 只返回分析分支。用户随后授权后，从相同分析基线建立了远程 `main`，而非直接把全部业务推入主干。初次修改默认分支与合并选项的 API 返回 403；用户之后在 GitHub Settings 调整，已读回确认默认 main、merge commit=true、squash=false、rebase=false。

每个分支结束比较预期差异、作者／提交者和验证输出；整合后与原候选逐文件比较，除明确列出的后续改动外应一致。数据库已应用迁移保持字节不变，环境文件、私有邮箱登记、数据库、凭据、模拟状态和临时产物不进入提交。遇到拆分导致依赖断裂，修正边界或停止该分支，不回退损坏原候选；不为增加历史节点重引已修复 bug。

作者／提交者使用用户提供的姓名与邮箱，身份登记与任务分配分开；时间记录实际提交时间，集中整理说明来源和验证。Git 作者邮箱会进入提交对象，后续推送到可见仓库会随历史公开；本地私有登记并不能让已推送的作者字段保密。

## 6. 执行清单

- [x] 用户确认 merge commit 与成员任务分支；同步 Git 工作流及各入口。
- [x] 保留 31 项提交内容，分配 21 条任务分支与依赖；登记私有身份信息。
- [x] 核对远程无 main，保存本地候选恢复快照并准备隔离拆分环境。
- [x] 已有第 1—27 项分配到 18 条本地任务分支，逐步检查；整合 tree 与拆分前快照完全相同，随后只更新本文等收尾文档。
- [x] 后续获授权创建远程 main、推送 18 条任务分支、创建 18 个真实 PR。
- [x] 用户手动调整默认分支及 GitHub merge 选项，已通过 API 核实生效。
- [x] 准备成员接手脚本、默认预览与故障恢复测试，操作方法见 Git 工作流。
- [ ] 成员本人检查并运行脚本，登记替代 PR；脚本完成不表示成员已经接手。
- [ ] 处理远程检查失败，成员真实审阅后按依赖顺序 merge commit 合入。
- [ ] 冯海伦独立验收、缺陷修复／回归和交付复现，记录实际结果。

## 7. 本地验证证据与查看方式

本地实现整合端点为 `ci/fanzhao/us-027-checks`，无需切换或清理当前工作区即可查看：

```sh
git log --graph --oneline ci/fanzhao/us-027-checks
git show feat/haoyu/us-006-student
git diff refs/backup/history-candidate-20261005 ci/fanzhao/us-027-checks -- apps packages scripts package.json package-lock.json
```

- Node22.23.3／npm10.9.9 在隔离工作区 `npm ci`、PG15 测试迁移及 strict typecheck 实际通过。原演示库和服务未 reset／重启。
- 契约 8 tests；数据库阶段 22；seed 23；认证 30；前端公共层 34；独立模拟分支 64；依赖整合后 71／75；学生分支 79；完整集成与最终 `make ci` 均为 10 files／108 tests，全 apps build 通过。数字为各阶段已有测试总数，不能当作该次新增行为的独立覆盖率。
- 初次契约阶段实际失败一次：缺少共享 `catalog.json` fixture；在提交前修正分配，把该文件提前随契约提交，重跑 8 项通过。没有修改测试或 fixture 内容。
- 收尾前完整 Git tree 与原快照相同，包含全部 138 个变更文件及其文件模式；没有重写业务代码、迁移、UI 或 lock。收尾文档另有明确差异，不改变运行行为。
- 18 个分支 tip 均可从整合端点到达；原 1—27 序号各出现一次，作者邮箱与私有登记逐条一致，Committer 为 Amp，实际日期与 AI／需求／线程来源已检查。
- 3 次必要的本地依赖合并分别为 P04b 接 P04a、P06 接 P03b、P09b 接 P05b；均无冲突，不代表平台批准或主干合并。
- 本地日志与机器检查记录保留在 ignored `.local/history-staging/`。不推送备份引用、私有登记、日志、测试环境或状态文件。

以上为本地拆分阶段结果。全仓 Markdown 的 176 项既有课程原文问题及依赖审计 3 high／2 moderate 仍是合入前需要处理或评估的已知限制，不因本地 `make ci` 通过而消失。

## 8. 已创建的真实 PR 与远程限制

| 工作包 | GitHub PR | 前置工作包 |
| --- | --- | --- |
| P01 | [#6](https://github.com/Nichengjin/software-engineering-project/pull/6) | 无，待审 |
| P02a | [#7](https://github.com/Nichengjin/software-engineering-project/pull/7) | P01 |
| P02b | [#8](https://github.com/Nichengjin/software-engineering-project/pull/8) | P02a |
| P02c | [#9](https://github.com/Nichengjin/software-engineering-project/pull/9) | P02b |
| P03a | [#10](https://github.com/Nichengjin/software-engineering-project/pull/10) | P02c |
| P03b | [#11](https://github.com/Nichengjin/software-engineering-project/pull/11) | P03a |
| P04a | [#12](https://github.com/Nichengjin/software-engineering-project/pull/12) | P02c |
| P04b | [#13](https://github.com/Nichengjin/software-engineering-project/pull/13) | P03a、P04a |
| P05a | [#14](https://github.com/Nichengjin/software-engineering-project/pull/14) | P04b |
| P06 | [#15](https://github.com/Nichengjin/software-engineering-project/pull/15) | P05a、P03b |
| P05b | [#16](https://github.com/Nichengjin/software-engineering-project/pull/16) | P06 |
| P07a | [#17](https://github.com/Nichengjin/software-engineering-project/pull/17) | P06 |
| P07b | [#18](https://github.com/Nichengjin/software-engineering-project/pull/18) | P07a |
| P08b | [#19](https://github.com/Nichengjin/software-engineering-project/pull/19) | P07b |
| P08a | [#20](https://github.com/Nichengjin/software-engineering-project/pull/20) | P08b |
| P08c | [#21](https://github.com/Nichengjin/software-engineering-project/pull/21) | P08a |
| P09b | [#22](https://github.com/Nichengjin/software-engineering-project/pull/22) | P08c、P05b |
| P09a | [#23](https://github.com/Nichengjin/software-engineering-project/pull/23) | P09b |

- #7—23 均为草稿；全部 PR 由当前认证账号 Nichengjin 集中创建，不是各成员独立发起。GitHub 不允许 PR 创建者批准自己的 PR；当前协作者列表仅有该账号，正式他人审批需成员实际参与。
- 仅精确推送任务 refs 与新 main；没有推送私有备份 refs、环境、凭据或标签，未操作现有 Dependabot PR #1—5，未强推或部署。
- 初次推送时三种合并方式均允许，后续用户手动调整后已核实默认 main、只允许 merge commit；本线程未新增保护规则或成员权限。
- 远程检查已经实际执行：[#6 CI](https://github.com/Nichengjin/software-engineering-project/actions/runs/37269531769) 基础检查通过，但课程原文 Markdown lint 失败；[供应链检查](https://github.com/Nichengjin/software-engineering-project/actions/runs/37269531737) 的 dependency-review 报仓库不支持该能力。完整实现还需结合 #23 的真实检查结果，不据本地结果填远程通过。

## 9. 成员本人接手（脚本已准备，实际执行待办）

用户确认恢复“成员本人发 PR、组长审阅”的方式。[成员脚本说明](../../GIT_WORKFLOW.md#成员脚本本人创建替代-pr) 提供每个人的命令和前置权限；[脚本](../../../scripts/member-pr.mjs) 直接复用远程提交，不重写历史。新增 `<原分支>-member-pr` 以便先创建并核实新草稿 PR，再链接、关闭旧 PR；保留旧 PR 讨论与原分支，不把关闭当作合入。

倪成锦的 7 项任务保留已有 PR，其余 4 位实现成员共 11 项待本人接手；冯海伦没有现成 PR，独立验收后再提交真实成果。各成员可以独立创建草稿，合并依赖仍按本表；执行后由组长把原／替代编号同步到索引和 traceability，不能继续用“旧 PR 已关闭”判断依赖完成。

脚本默认只读，`--apply` 才写远程；相同作者、版本和标记可复用，失败不盲目重试，版本不同／他人分支／关闭状态不符时停止人工处理。模拟测试验证失败与恢复，成员的实际登录写入、Windows 运行及真实替代 PR 检查仍待本人执行。
