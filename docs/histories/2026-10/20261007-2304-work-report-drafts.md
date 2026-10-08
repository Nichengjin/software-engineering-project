## [2026-10-07 23:04 Asia/Shanghai] | Task: US-028 个人汇报与小组总结初稿

### Execution Context

- Agent：Amp；[当前线程](https://ampcode.com/threads/T-01a116c8-f8db-7098-a5f1-68a17a3ae484)。
- 模型：会话未提供可核实标识，不推断；运行环境：Linux orb。
- 文档基线：[main 651697c](https://github.com/Nichengjin/software-engineering-project/commit/651697c88ee727a405b84cb8b62b2c6ae3a6dc7e)。

### 用户诉求

> 根据此前分工、commit history及Amp线程，用Markdown起草六份个人工作汇报和一份小组总结，每份放独立文件夹以管理附件；安排七个subagent撰稿，后续本人补充实际问题与经历。

### 改动与理由

- 登记US-028／IT-04，使用 `docs/nichengjin/us-028-work-report-drafts` 本地分支。
- 读取完整Git历史及集成、测试、性能修复线程，七名撰稿subagent分别写六名成员与全组报告，写入互不重叠的目录。
- 主agent核对所有初稿、代表提交与仓库证据，修正正式负载次数及统一待补标记；补充总入口和成员修改、附件脱敏说明。
- 区分领域责任、Agent集中执行及待本人确认的贡献，不虚构独立开发、测试、审批或心得；保留原失败、后续复测与未测范围。
- 初稿包含实质正文、技术难点、验证与证据，实际经历、贡献比例、签名及最终课程交付留待本人／团队确认。
- 同步北极星与IT-04入口，但不勾选课程材料定稿，不把US-028标为已完成。

### 文件与验证

- `docs/work-reports/README.md` 及 `nichengjin`、`haoyu`、`mazhe`、`fenghaiyang`、`fenghailun`、`fanzhao`、`team` 各目录的 `report.md`。
- `docs/product-specs/backlog.md`、`docs/iterations/IT-04-verification-and-delivery.md`、`docs/NORTH_STAR.md`。
- 文档骨架、仓库卫生、Markdown lint和本轮本地链接／提交引用检查；正文人工核对分工、源码、history及测试报告v0.3。
- 初稿撰写阶段只整理文档，没有修改产品或重跑业务测试、浏览器、长时间负载；没有必需截图，不生成空附件。获授权交付后按仓库约定重新执行 `make ci`；首次因本地PG服务未启动而失败，启动监督式postgres服务后重跑，不修改产品、依赖或测试断言。
- 重跑 `make ci` 退出0：13文件／215测试通过（测试阶段237.54秒），类型检查、真实PG迁移与集成、全应用构建通过；12份本轮Markdown检查0问题，177个相对文件链接与34个提交引用核对通过。

### 交付状态

初稿形成时七份材料仅在本地，未commit、push、创建PR或合入；本人修订、团队确认贡献及课程提交仍待完成，US-028待评审。

用户随后授权逐人署名提交、push并以倪成锦Author的merge commit合入main。六份个人汇报分别使用对应成员既有Git身份，小组总结和公共入口／跟踪文档由倪成锦署名；实际Committer为Amp，保留AI协作来源与真实提交时刻，不追认为本人已审核或独立撰写。没有修改GitHub账号显示名或仓库保护设置。

七个原提交已推送至 `docs/nichengjin/us-028-work-report-drafts`，如下逐项核对Author姓名／邮箱与历史身份一致；六份个人报告各自提交仅包含自己的文件。

| 原提交 | Author | 内容 |
| --- | --- | --- |
| [f964760](https://github.com/Nichengjin/software-engineering-project/commit/f964760) | 倪成锦 | 倪成锦个人报告 |
| [ade17d3](https://github.com/Nichengjin/software-engineering-project/commit/ade17d3) | 浩宇 | 浩宇个人报告 |
| [f10e296](https://github.com/Nichengjin/software-engineering-project/commit/f10e296) | 马喆 | 马喆个人报告 |
| [74150a3](https://github.com/Nichengjin/software-engineering-project/commit/74150a3) | 冯海洋 | 冯海洋个人报告 |
| [87f8a2b](https://github.com/Nichengjin/software-engineering-project/commit/87f8a2b) | 冯海伦 | 冯海伦个人报告 |
| [c219bb8](https://github.com/Nichengjin/software-engineering-project/commit/c219bb8) | 范昭 | 范昭个人报告 |
| [1eaf4df](https://github.com/Nichengjin/software-engineering-project/commit/1eaf4df) | 倪成锦 | 小组总结、公共入口及需求／迭代跟踪 |

[PR #27](https://github.com/Nichengjin/software-engineering-project/pull/27)的[完整CI](https://github.com/Nichengjin/software-engineering-project/actions/runs/37645443502)与[供应链检查](https://github.com/Nichengjin/software-engineering-project/actions/runs/37645443455)通过。随后本地 `--no-ff` 合入main，由本次双亲merge commit保留七个原提交，merge Author为倪成锦、Committer为Amp；合并提交同时补齐交付状态和需求追溯，不修改报告正文或产品。

集中合入不记作其他成员审批、个人经历确认或课程验收；US-028仍待评审，未打tag、发布或部署。

## 2026-10-07 续记：先扩充倪成锦报告至v0.2

### 本轮诉求与范围

用户认为各份初稿太短，随后明确其他成员先不处理：倪成锦报告应从需求分析贯穿开发，每阶段一章，写阶段思考、决策问题与原因、真实实现问题、处理过程、协作和验证，尽量补截图。本轮只修改倪成锦正文、其附件及公共入口／追溯／本history；其他五份个人和小组报告不改。

基于[已合入初稿的main](https://github.com/Nichengjin/software-engineering-project/commit/fb00ab3ff2b8759e19ec024999a453874871688c)建立 `docs/nichengjin/us-028-report-expansion`。沿用US-028／IT-04，不新建重复需求。此前PR #27交付已完成，不能把其授权和合入记录当成本轮v0.2已远程交付。

### 整理方法与产物

- 读取需求／OOA／设计／详细设计／ADR、需求与联调history、时钟修复、性能失败及复测报告、分工和完整Git记录；回查需求分析与设计实现线程，区分用户决定、委托执行者判断和Agent实际执行。
- 正文由八个开发阶段、个人总结及证据章组成，实质扩写保存占位、4+2、关闭准入、对象分离、技术选型、锁和版本墓碑、认证权限、outbox、seed登录／审计外键／调度／删除关闭竞争／时钟bug、测试方法、三轮性能诊断和集成交付。
- 保留设计问题与实际故障的区别、原性能失败和未测范围；没有记录的同学分歧、本人投入、评审和贡献比例保留本人补充，不虚构会议与经历。
- 复用原A01分析图并解释多重性／分析与实现区别，保留试用水印；不修改共享UML模型或去水印。本轮引用的原图与四张实拍均经媒体工具检查。

### 实拍环境、断言与限制

使用现有 `tests/acceptance/fixture.ts`，临时截图驱动经 `amp orb service start report-capture` 监督运行。随机新建可丢弃数据库，真实迁移、12名虚构学生、三角色账号、独立HTTP模拟；构建后的SPA由临时Hono listener托管，业务时钟沿用夹具。没有修改产品、原浏览器runner、测试期望或开发数据库，没有重开已关闭学期。

前置直接准备两名学生M1—M4注册和三名学生B1注册；演示者S101从页面保存4+2、正式提交、将M4换为冲突X2，随后教务页面关闭。断言保存后v1／0有效注册、提交后v2／四门有效主选及M1具体名册、冲突后完整服务器课表不变、CLOSED／12笔ACK及三笔1250、三笔625、六笔0元。截图等DB及页面12笔统计都完成才捕获。

最终驱动输出：`PASS: saved without registration, valid submit, conflict rollback, close and 12 acknowledged bills; 4 screenshots at DPR 2.` 保存于倪成锦 `attachments/` 四张PNG；1280×900 CSS／DPR2，HeadlessChrome154，实际采集时间Asia/Shanghai 2026-10-08 00:58。报告按任务日期2026-10-07整理；页面业务日期由固定夹具控制，不是采集日期。

初次驱动的“确认”精确匹配不等于实际“确认操作”，导航带图标也使完整文本匹配失败；改为实际控件文字及限定打开dialog的查找，并等待数据就绪，没有改页面或业务规则。监督服务默认失败重启，临时驱动后改为一次执行完成／失败后清理资源并等待显式停止，避免继续重跑。最终成功后浏览器、listener、runtime、模拟及自有数据库已清理，停止截图服务并删除临时驱动。

媒体检查确认四图内容与断言相符，没有密码、token、完整SSN或真实学生数据。冲突图的全页捕获中modal遮罩只覆盖当前视口，保留真实输出；关键错误、原注册及v2仍可读，不将其当新UI改动。截图用于报告演示，不能代替全量E2E、故障恢复、调剂成功、性能或Windows／Edge验收。

### 本轮验证与交付

执行 `make check-repo`、Action固定SHA检查、`git diff --check` 和Markdown lint；核对相对文件／图片及提交链接、截图副本、正文来源和变更范围。纯文档／图片变更不重跑完整215项回归或35分钟负载，报告保留历史执行的日期与范围，不称为本轮新测试。具体命令结果由当前线程记录。

扩充完成时v0.2及附件仅在本地工作分支，尚未commit、push、创建PR或合入；本人确认、其他成员扩充、贡献比例与课程定稿仍待完成。US-028继续待评审，未发布或部署。

用户随后授权本轮提交与推送，明确Author为倪成锦；交付分支为 `docs/nichengjin/us-028-report-expansion`，实际Committer为Amp，保留AI来源和真实提交时间。提交范围仅四份Markdown及倪成锦四张附件；验证为Markdown 0问题、仓库骨架／卫生和Action固定SHA通过，94个相对链接、22处提交引用和四张附件副本核对通过。本轮不创建PR、不合入main，实际推送结果以远程分支及当前线程记录为准。
