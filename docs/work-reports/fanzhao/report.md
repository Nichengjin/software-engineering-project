# 范昭个人工作汇报（初稿）

- 姓名：范昭；学号：21230724。
- 版本：v0.1；编写日期、证据截至日期：2026-10-07。
- 关联：US-028／IT-04；领域工作关联 US-005、US-016、US-022、US-027。

本稿由 Agent 根据仓库证据整理，供本人审核修改。既有实现由 Agent 集中执行；下表提交的 Git Author 为范昭、Committer 为 Amp，正文保留 AI 来源及当时尚未完成成员复核的说明。Author 归属、PR 合入不证明本人独立开发、亲手测试或审批，本文不据此预填贡献比例。

## 一、角色与工作范围

依据[团队分工](../../TEAM_ROLES.md)和[个人指南](../../member-guides/fanzhao.md)，我的责任范围是外部课程目录与计费模拟、初始化和演示数据、运行与启动说明、配置管理及材料汇总。相关成果为学生浏览、关闭选课和补选提供可联调环境；选课事务、关闭调剂和目录同步由其他领域协作完成，不能整体归为个人成果。目前重点是接手核对已有候选、补齐本人实际操作记录，独立验收仍由测试负责人承担。

## 二、已形成的领域成果

**运行底座。** 仓库形成五个 npm workspace，共用锁文件和 strict TypeScript 配置，采用 Node22、Prisma6、PostgreSQL15。安装、生成 client、迁移、seed、开发和构建都有明确命令；本地 Compose 与 orb 监督服务分别有说明。初始化脚本补齐缺失配置、生成随机密钥，重复执行保留已有数据；迁移不使用 reset。演示库与测试库隔离，测试连接不合法或 PG 不可用直接失败，不静默跳过。

**演示数据。** seed 提供四学期、14名虚构学生、4名虚构教授和1名教务，包含先修及格／不及格、历史成绩、上一学期名册及零元账单等状态，当前学期不预占名额。每个账户生成独立随机初始密码和盐，使用 scrypt 存储；明文只落 ignored 私有凭据文件，权限600，不打印或交付。已有数据时跳过，不覆写密码。目录 JSON 与虚构源数据核对一致，供模拟服务使用；这不是实际学生数据，也不是每次启动覆盖数据库的脚本。

**外部 HTTP 模拟。** 独立 Hono 服务不连接业务 PG，提供目录快照、版本账单及私有控制接口。已知学期的空目录与未知学期、503故障明确区分；目录控制更新会递增 revision。业务 token 与控制 token 分开，控制默认关闭，模拟端口不公开给 SPA。目录和接收账单事实持久化于独立文件，重启不被 seed 覆盖；故障模式可注入延迟、不可用、超时和接收后断连，但模式本身存于内存，不能误称故障开关跨重启持久化。

**发送、重试与恢复。** 计费服务按学生、学期生成递增版本，以 `termId:studentId:version` 标识业务；同事务写 outbox，补选生成完整更正版并将旧版标为 SUPERSEDED。发送有持久化状态、尝试次数和租约，失败后60秒再试；租约过期可恢复，批次最多50条、分组最多8并发。外部采用版本替代而非金额累加，零门课程也产生零元账单，模拟接收不代表真实扣款。

**CI。** #23 将真实PG15迁移、client生成、类型检查、全量 Vitest 和三个应用构建接入既有门禁，同时保留文档、仓库卫生、Shell语法和 Action SHA检查。测试数据库为隔离 runner 临时库，不迁移或 seed 开发库。CD仍是制品、SBOM和 provenance 骨架，不等于已部署或发布。

## 三、两个技术难点及证据处理

第一是“外部已接收、API却没有收到确认”。只重发请求会造成重复计费，只信内存又会丢去重事实。实现将同 ID 同内容判为 DUPLICATE，不同内容返回409；先写文件、fsync、原子 rename及父目录fsync，再确认。真实HTTP测试在接收后断连，检查磁盘后 SIGKILL 子进程，再启动重发，核对只接受一次业务标识；新版先到、旧版迟到仍保持最高版本。文件写入不确定时拒绝继续读写，避免假确认。该处理限单进程写一个状态文件，不是分布式一致性方案。

第二是“重试不能改变账单含义，更正又不能累加旧金额”。账单冻结课程快照和单价，旧账重试不重查后来变化的目录；精确十进制汇总学分后一次舍入，避免浮点和逐门舍入误差。outbox重发沿用原业务标识，补选才创建新版本。统筹真实开发联调记录了14笔账单全部ACK（3×1100元、11×0元），补选后0元v1被替代、300元v2确认；模拟文件保留两版而不相加。这些是团队集成证据，不是本人手工测试记录。

## 四、验证结论与局限

模拟模块开发记录为41项真实HTTP测试；初期集成门禁108项，集中合入完整远程CI为134项。后续[测试报告v0.3](../../TEST_REPORT.md)记录207项回归以及性能修复后的215项回归、Linux同orb三进程2000用户长测通过，也保留原macOS2000用户未达标事实。这些全项目结果仅作团队证据，不归个人执行。传递依赖升级、private仓库安全检查替代、授课历史时钟修复均由集中执行闭环，不能记为范昭亲自修复。Windows／Edge、七天可用性、全部故障点、独立机器初始化仍有缺口，不能称所有NFR达标；同机干净依赖复现也不是跨机交付完成。

## 五、后续计划与本人补充

我计划在10月15日前完成配置管理计划及最终配置库：明确基线、版本标识、变更审批、迁移和依赖锁定、私有配置注入、备份恢复、材料清单及完整性校验；随后在另一台机器按启动说明初始化、演示、记录失败与复测。这些尚未完成，不能列作已交付成果。release打tag、真实程序制品与课程材料定稿仍需团队确认。

- 【待本人补充】审核日期、逐段修改意见、实际承担内容及相关差异／评审链接。
- 【待本人补充】本人安装、迁移、seed、启动实测的系统版本、命令、时间和结果。
- 【待本人补充】故障注入的脱敏输入、预期输出、实际HTTP／outbox状态及恢复记录。
- 【待本人补充】独立环境复现、最终配置库交付和遗留问题；个人心得、真实工时、贡献依据及本人签名。

本目录后续用 `attachments/` 存放本人提供并脱敏的日志、截图或签字材料，提供后再登记来源与日期；当前不创建空附件或假图。

## 六、证据索引

| 工作项 | Git提交／PR（均已合入） | 文件或验证证据 |
| --- | --- | --- |
| 工作区 | [e5d0f13](https://github.com/Nichengjin/software-engineering-project/commit/e5d0f13)、[PR #7](https://github.com/Nichengjin/software-engineering-project/pull/7) | [根包配置](../../../package.json) |
| 虚构seed | [435edd9](https://github.com/Nichengjin/software-engineering-project/commit/435edd9)、[PR #9](https://github.com/Nichengjin/software-engineering-project/pull/9) | [seed实现](../../../packages/db/prisma/seed.ts)、[复验](../../../packages/db/src/seed.integration.test.ts) |
| 本地启动 | [33df617](https://github.com/Nichengjin/software-engineering-project/commit/33df617)、[PR #9](https://github.com/Nichengjin/software-engineering-project/pull/9) | [DEVELOPMENT](../../DEVELOPMENT.md) |
| 独立模拟及测试 | [95a0f52](https://github.com/Nichengjin/software-engineering-project/commit/95a0f52)、[25c6b62](https://github.com/Nichengjin/software-engineering-project/commit/25c6b62)、[PR #12](https://github.com/Nichengjin/software-engineering-project/pull/12) | [SIMULATORS](../../SIMULATORS.md)、[HTTP测试](../../../apps/simulators/test/http.test.ts)、[持久化实现](../../../apps/simulators/src/store.ts) |
| 计费服务 | [950fbd3](https://github.com/Nichengjin/software-engineering-project/commit/950fbd3)、[PR #19](https://github.com/Nichengjin/software-engineering-project/pull/19) | [billing实现](../../../apps/api/src/modules/billing/service.ts)、[联调history](../../histories/2026-10/20261005-0312-system-design.md) |
| 完整CI | [99e9e29](https://github.com/Nichengjin/software-engineering-project/commit/99e9e29)、[PR #23](https://github.com/Nichengjin/software-engineering-project/pull/23) | [CICD](../../CICD.md)、[检查修复边界](../../histories/2026-10/20261005-merge-checks.md)、[远程134项CI](https://github.com/Nichengjin/software-engineering-project/actions/runs/37324793707) |

过程参考：[授权实现与真实开发联调线程](https://ampcode.com/threads/T-01a10ae1-7ce9-7136-8d6e-7a8f9ca8ee5d)。线程与仓库history互为补充，不作为成员本人审批或独立验收签字。
