# 2026-10-05 成员任务分支与保留提交的合并规范

- 执行者：Amp，orb；具体模型标识未提供，不推断。
- 关联：US-002／IT-01；执行计划跨 IT-02—04。
- 用户要求：保留原提交、不 squash；成员拥有各自任务分支；在已认可的提交内容上安排分支及合入顺序，并接收提交身份。

## 变更与原因

- Git 工作流改为 `<type>/<member>/<需求编号>-<slug>` 短期分支与 merge commit，同步 README、CONTRIBUTING、CICD，旧分支保留。
- [提交与分支计划](../../exec-plans/active/2026-10-05-collaboration-history.md) 保留 31 项拟定提交，分配 21 条分支及依赖、评审边界、共享文件整合与快照回退要求。
- TEAM_ROLES 更新显示姓名、成员标识和私有登记状态；不把用户提供的私人邮箱重复写入版本化文档，不改全局 Git 身份。说明邮箱最终会出现在提交对象中。
- 区分本地合并图与真实平台 PR；远程 merge 选项、规则兼容及正式推送须后续授权操作。

## 初始规划阶段的验证与交付状态

本轮仅文档与 ignored 身份登记，采用 Markdown lint、相对文件链接、分支名合法性、31 项覆盖与依赖无环检查，以及仓库文档／卫生检查。未修改业务代码，不重跑数据库／浏览器测试；本轮检查不证明未来每个分支的代码已经构建通过。

未创建提交、计划分支或 PR，未推送、合并、改写原历史或调整远程设置。成员本地脚本提交／推送／创建 PR 的提议处于讨论阶段，尚未编写或运行脚本。

## 后续授权步骤 1：本地分支与提交准备

用户随后确认无需压缩包，授权先在本地按指定 Author 准备分支和提交。采用堆叠分支保留前置提交，不等待尚未发生的 PR 合入；在独立 worktree 操作，原工作区和既有 5 个提交保留，拆分前另存仅本地候选恢复引用。未运行成员端推送／PR 脚本。

- 已准备 18 条任务分支、27 项实现提交、3 次必要的依赖合并；本次收尾另有 1 条文档提交，合计新增 31 个提交节点。分支、归属及实际依赖详见提交计划。
- Author 使用用户指定成员身份，实际 Committer 为 Amp；保留真实日期、集中整理 AI 候选的正文、需求及线程来源。不把指定 Author 解释为成员本人已经认证推送、独立开发或批准 PR。
- 依赖按源码修正：人员服务在课表之后，计费先于关闭，完整应用入口在集成阶段接通。共享 fixture 提前随契约提交，不人为拆散同文件函数或引入已修复 bug 来增加提交。
- 3 次合并分别接入模拟、前端公共层、学生分支，只表示本地依赖整合。冯海伦验收、测试报告、独立环境交付的 3 条计划分支及 4 项提交未创建，等待实际执行。
- 远程检查发现尚无 `main`，默认分支仍为已有分析分支；后续需授权选择／建立目标主干。本次没有推送、创建 PR、修改远程设置、正式合入或发布。

## 分阶段复验与内容一致性

- 每次提交检查文档／仓库卫生；workspace 安装与配置检查通过，契约之后执行 strict typecheck 及当前已有测试。完整入口之前不是所有 apps 均可独立运行，不把组件级验证称为完整 HTTP 验收。
- 契约阶段首次检查缺少 catalog fixture，调整文件分配后 8 项重跑通过；保留初次失败日志。数据库阶段 22、seed 23、认证 30、前端公共层 34、独立模拟分支 64，后续整合 71／75、学生分支 79 项通过。这些是阶段总数，不是每项提交新增覆盖数。
- Node22.23.3／npm10.9.9／PG15 下，完整集成和最终 `make ci` 均通过：`Test Files 10 passed (10)`、`Tests 108 passed (108)`、strict typecheck 和全部 app build。原演示数据库与运行服务未重置或重启。
- 收尾文档之前，整合分支的完整 Git tree 与候选快照完全相同：138 个变更文件及模式均保留，业务代码、UI、迁移和 lock 无额外修改。收尾仅更新本记录、分支计划、Git 工作流、分工、执行计划、IT-01 与追溯矩阵。
- 逐条核对 27 项标题／作者与私有登记、真实提交者、来源 trailer；18 个任务 tip 均可从最终整合分支到达。文档收尾另做 Markdown lint、相对链接和差异卫生检查。

阶段日志留在 ignored 本地检查目录，不包含于交付历史。全仓 Markdown lint 的 176 项既有课程原文问题、依赖审计 3 high／2 moderate 仍保留待处理；108 项开发测试不替代冯海伦独立验收、NFR 或远程 CI。

## 后续授权远程操作：main、分支推送与真实 PR

用户随后明确要求执行远程操作。以已有分析基线创建远程 `main`，原子推送精确的 18 条任务分支，创建 [#6](https://github.com/Nichengjin/software-engineering-project/pull/6)—[#23](https://github.com/Nichengjin/software-engineering-project/pull/23)。#6 待审，其余为草稿，全部以 main 为目标；PR 描述包含需求、任务提交、前置 PR、本地证据与未完成项。完整映射见 [提交计划第 8 节](../../exec-plans/active/2026-10-05-collaboration-history.md#8-已创建的真实-pr-与远程限制)。

- GitHub 回读确认创建者均为 Nichengjin，头分支与计划一致，18 个 PR 均未合入；已有 Dependabot PR #1—5 未改动。
- 提交 Author 与 PR 创建者不同：这是 Amp 代 Nichengjin 集中推送／创建，不能记为各成员本人创建 PR。当前协作者列表只有该账号，GitHub 不允许创建者批准自己的 PR，正式他人审批需实际安排。
- 修改默认分支、关闭 squash／rebase 的请求返回 403；回读确认默认仍是分析分支、三种合并方式仍均允许。账号有仓库 admin 角色不代表当前 App token 有设置写权限，未尝试绕过授权。管理员需在 Settings 将默认分支切到 main，并只保留 merge commit。
- 未强推、改写原提交、推送标签／私有恢复 refs、调整成员或保护规则、审批、合并、发布或部署。业务、迁移、lock 与 UI 均不变，仅将本次状态同步到协作文档。

## GitHub Actions 的实际结果

创建 PR 后等待首次工作流完成，没有把本地通过当作远程通过：

- [#23 CI](https://github.com/Nichengjin/software-engineering-project/actions/runs/37269611776) 的锁定依赖安装、类型检查、真实 PG15 测试和全应用构建通过；日志为 `Test Files 10 passed`、`Tests 108 passed`。随后 Markdown lint 报 `176 error(s)`，所以该工作流整体失败。
- [#6 CI](https://github.com/Nichengjin/software-engineering-project/actions/runs/37269531769) 基础检查通过，同样因课程原文 Markdown 格式失败；main 的基线检查也失败，未绕过此门禁。
- [#23 供应链检查](https://github.com/Nichengjin/software-engineering-project/actions/runs/37269611789) 的 dependency-review 报 `Dependency review is not supported on this repository`，需要管理员确认平台能力／配置，不能把它称作已通过的安全扫描。
- 同一次 OSV 扫描实际找到 2 个 high：`deepmerge-ts 7.1.5`（GHSA-ggr8-5vv4-36mx）与 `uuid 8.3.2`（GHSA-w5hq-g745-h8pq）；报告修复版本分别为 8.0.0 与 11.1.1。此结果与先前 npm audit 的统计口径不同，保留原数据；兼容升级及影响复核待后续任务，不为本次发 PR 改动依赖或屏蔽扫描。

远程 18 个 PR 的首次 CI／供应链工作流都已结束且整体失败。当前交付为“已推送且真实 PR 已创建，待修复检查／真实审阅”，不是“可直接合并”。本次收尾文档提交后触发的检查以 PR 最新结果为准。
