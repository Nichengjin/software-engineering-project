# 倪成锦个人工作汇报（初稿）

- 姓名：倪成锦；学号：21230728。
- 项目：Wylie College 学生选课系统；角色：项目统筹、技术负责人。
- 版本：2026-10-07 v0.1 初稿；证据截至该日，主线基线[651697c](https://github.com/Nichengjin/software-engineering-project/commit/651697c88ee727a405b84cb8b62b2c6ae3a6dc7e)。
- 汇报整理关联：US-028／IT-04；领域需求包括US-002—004、US-006—008、US-015、US-017—020、US-024—027。
- 用途：课程个人汇报草稿，待本人补充实际经历并确认，不是最终签字材料。

## 一、职责与协作边界

按照[团队分工](../../TEAM_ROLES.md)，我的责任范围是总体设计、数据模型与接口契约、登录权限、选课核心规则与事务、关闭调剂及集成发布。学生端、教授端、教务端分别由浩宇、马喆、冯海洋负责，范昭负责外部模拟与交付，冯海伦负责独立测试。我需要协调共享接口和规则，而不是把各成员领域的全部产出算作个人成果。

本轮用户授权统筹并使用 Agent 并行推进，具体实现、自动化测试及集中 Git 操作由 Amp 执行。部分原提交按授权登记为倪成锦 Author、Amp Committer；这一记录与责任归属可追溯，但不证明我独立编写、执行测试或逐项审核。以下汇报按负责领域说明已形成的客观成果，实际个人投入另行补充。

【待本人补充】本人实际提出的设计意见、审核或修改的文件及日期、与成员沟通的方式、投入时间；请区分发起任务、审核结果和亲自实现。

## 二、负责领域的阶段成果与取舍

需求阶段形成了[需求分析 v0.6](../../REQUIREMENTS_ANALYSIS.md)。Q-01—Q-15的澄清将题目中容易产生歧义的规则转为可验收条件：保存不占名额，也不退出原注册；第一次正式提交为4个主选加2个备选，后续提交放宽数量；正式提交整份成功或整份失败。OOA又发现R-01—R-04边界，最终登记为Q-16—Q-19，其中提前关闭须等待已准入提交完成，并将其结果纳入关闭。这样可以避免页面、后端和测试对“提交成功”理解不一致。上述结论仍需团队评审，不能把用户采纳执行建议当作正式评审。

分析与设计层形成了[OOA模型](../../design-docs/object-oriented-analysis.md)、[总体设计](../../design-docs/system-design.md)、API契约及9张原生UML设计图。分析类用于表达实体、边界和控制职责，不逐一映射数据库表；设计图则覆盖部署、组件、数据关系、准入排空、关闭事务和计费恢复。技术方案采用React SPA、Hono、Prisma及PostgreSQL，以共享DTO减少前后端契约漂移，以数据库唯一约束和CHECK约束兜住持久化边界。

核心业务优先保证一致性。认证采用持久化会话、角色和所有权检查，并校验变更请求的CSRF及Origin。课表保存与有效注册分离，正式提交在事务中检查先修、冲突、容量和版本，失败保留旧注册；删除保留版本墓碑，阻止旧页面覆盖重建结果。写事务使用固定锁序，业务确认时间在最终持久化确认点判断，而不是请求开始时间。单API实例和全局写锁降低了并发推理难度，代价是吞吐受限，不能直接扩展为多实例部署。

关闭选课通过准入gate拒绝新写并排空在途任务，再进行单轮调剂、取消不足人数班次、更新课表和生成账单。关闭结果与outbox同事务提交，外部计费失败不回滚选课，而由持久化任务按60秒重试。补选生成完整的新版本账单，由外部按版本替代而非金额累加。这是本地事务与外部幂等协议的组合，不宣称跨系统分布式事务。集成阶段将三角色页面、API、真实PG和独立HTTP模拟接通；用户授权集中合入原PR #6—23，保留merge commit和原作者，不补造成员审批。

## 三、实际问题及处理

第一个问题是授课历史的时间来源不一致。首次完整回归出现130通过、3失败：创建时间由数据库默认真实时钟生成，结束时间却来自注入的业务时钟，固定测试时间早于真实时钟时违反时间顺序约束。处理不是改测试日期或放松SQL约束，而是创建记录显式使用`rt.now(tx)`；补充首次创建、七秒后取消、十一秒后重选的精确断言，先复现失败，再统一时间来源。它说明可注入时钟必须贯穿全部业务时间写入。

第二个问题是高负载下目录同步积压。原macOS 2000用户档成功且不超过120秒的比例只有63.04%，未达到80%要求。诊断区分了HTTP连接阶段重置与应用目录串行队列，不能把客户端超时直接归因于数据库。Linux修复将同学期尚未开始的下一轮刷新合并，已开始的HTTP之后到达的请求进入下一轮，既减少重复读取，又保留请求到达后的新鲜度边界；随后缩小查询和投影，再合并只读下一轮请求。三次短诊断依次为27.03%、75.12%、100%，前两次失败保留，不能用最后短测替代正式长测。修复未增大120秒期限、数据库池或内核参数，也未取消全局写锁。

第三个问题是测试终态的采样时机。客户端超时后服务端仍可能继续提交，旧脚本在排空前取快照，原806名客户端差异不能直接解释为数据库丢失。工具改为停止轮询、等待已准入业务完成后再校验；失败请求仍留在分母。故意1ms超时复测中仍有15名客户端最后确认集合不同，说明排空并不等于客户端自动重同步，PERF-02仍未关闭。

## 四、验证结果、局限与后续

据[测试报告 v0.3](../../TEST_REPORT.md)及[性能history](../../histories/2026-10/20261007-1918-catalog-throughput.md)，Linux orb中客户端、单API、HTTP模拟分为三个进程，仍同机运行。正式2000已认证用户、5分钟预热加30分钟稳态完成264615笔交易，全部成功且不超过120秒；105899次目录查询全部成功且不超过10秒；排空后8000条有效注册满足容量不超过10、每生不超过4门，课表和客户端零错配。13文件、215项回归及类型检查、构建通过，PR #25修复和#26追溯均已合入，尚未发布。

这些结果不覆盖全部64条AC子场景，也不是生产容量认证。总交易最大延迟9923.79ms，接近10秒门槛，不能承诺更大规模或外部故障下仍有足够余量；原macOS失败不能由不同环境复测抹去。Windows Chrome／Edge、独立机器初始化、七天可用性、独立验收和团队评审仍需补齐，US-018继续进行中。IT-01原评审未举行，后续实现也不能追认旧节点完成。

阶段成果已从需求、模型推进到可运行链路和可复查的性能证据。后续重点是组织真实设计走查、复核未覆盖场景与超时重同步、完成独立环境演示，最后按完成定义发布。个人贡献应依据实际设计、审核、修改和协作记录认定，而不是按提交数量或Agent执行量计算。

【待本人补充】实际解决问题的参与过程、本人复盘与收获、未完成职责及原因、后续完成日期。个人贡献比例由本人和团队核实后填写，不预填；本人签名与确认日期待补。后续真实附件放在同目录`attachments/`，仅收录实际材料，不生成空附件或占位图片。

## 五、代表性证据

下表选取10个原始变更核对范围，不重复统计祖先提交、merge节点或同补丁副本；证据支持领域产出，不直接换算个人贡献。

| 原提交 | 核对内容 | 对应PR或仓库依据 |
| --- | --- | --- |
| [218af5a](https://github.com/Nichengjin/software-engineering-project/commit/218af5a) | 需求v0.4及澄清结论 | [需求分析](../../REQUIREMENTS_ANALYSIS.md) |
| [75816e3](https://github.com/Nichengjin/software-engineering-project/commit/75816e3) | OOA、分析图及后续需求边界 | [OOA](../../design-docs/object-oriented-analysis.md) |
| [892fd74](https://github.com/Nichengjin/software-engineering-project/commit/892fd74) | 9张设计图、可编辑源模型 | [#6](https://github.com/Nichengjin/software-engineering-project/pull/6) |
| [fc04f13](https://github.com/Nichengjin/software-engineering-project/commit/fc04f13) | Prisma模型、迁移和约束测试 | [#8](https://github.com/Nichengjin/software-engineering-project/pull/8) |
| [e5a87b7](https://github.com/Nichengjin/software-engineering-project/commit/e5a87b7) | 持久化session与请求安全 | [#10](https://github.com/Nichengjin/software-engineering-project/pull/10) |
| [53c45ed](https://github.com/Nichengjin/software-engineering-project/commit/53c45ed) | 保存、提交、删除事务服务 | [#14](https://github.com/Nichengjin/software-engineering-project/pull/14) |
| [186c9e3](https://github.com/Nichengjin/software-engineering-project/commit/186c9e3) | 关闭调剂及补选事务 | [#20](https://github.com/Nichengjin/software-engineering-project/pull/20) |
| [a330b47](https://github.com/Nichengjin/software-engineering-project/commit/a330b47) | 入口、启动恢复、集成测试及联测记录 | [#22](https://github.com/Nichengjin/software-engineering-project/pull/22) |
| [655ad72](https://github.com/Nichengjin/software-engineering-project/commit/655ad72) | 授课创建时间使用业务时钟 | [检查history](../../histories/2026-10/20261005-merge-checks.md)；不另计同补丁`a17270c` |
| [80d0142](https://github.com/Nichengjin/software-engineering-project/commit/80d0142) | 目录下一轮合并、回归和三进程负载 | [#25](https://github.com/Nichengjin/software-engineering-project/pull/25)；[#26追溯](https://github.com/Nichengjin/software-engineering-project/pull/26) |

线程来源：[集成与集中合入线程](https://ampcode.com/threads/T-01a10ae1-7ce9-7136-8d6e-7a8f9ca8ee5d)、[目录性能诊断与修复线程](https://ampcode.com/threads/T-01a115eb-a415-74a3-a081-1fb0ea0d3575)。事实以对应仓库文件和原提交交叉核对，线程不替代本人确认。
