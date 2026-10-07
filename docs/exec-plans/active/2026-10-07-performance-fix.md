# US-018：TCP 接入与目录刷新性能修复

- 日期：2026-10-07；迭代 IT-04；负责人倪成锦，执行 Amp。
- 分支：`fix/nichengjin/us-018-catalog-throughput`，基于当日最新 main。
- 初始授权：先核对 Linux orb 的 TCP 问题，再实现下一轮目录刷新合并并复测；当时未授权远程交付。
- 后续授权：用户确认提交、push并以merge commit合入main；按倪成锦Author／Amp Committer保留AI来源，通过PR及远程检查交付并登记合入证据，不代表成员独立评审。未授权发布tag或部署。

## 目标与约束

处理 [测试报告](../../TEST_REPORT.md) PERF-01 的接入干扰和逐请求目录串行积压。保留请求到达后拉取目录、同学期发布顺序、关闭准入及排空、版本检查、原子事务、120秒客户端期限、全部失败分母。暂不改变全局写锁；人员维护的跨学期一致性不是本轮重构范围。

负载客户端、单实例 API、HTTP 模拟分别使用子进程，PostgreSQL 独立进程；仍是同一 Linux orb，不声称独立服务器容量认证。测试只创建和清理自己的随机 `_test` 库。

## 步骤与证据

- [x] 新分支、现有报告与目录／gate／关闭／负载实现核对。
- [x] 新增目录屏障测试，旧实现6项中4项失败；刷新合并后6项通过。
- [x] 无数据库 Node／Hono TCP 对照：各2000连接，瞬时及2秒分散均成功；瞬时有Linux监听溢出，分散无溢出。未改内核参数。
- [x] 压测三进程隔离，10用户短时工具自检通过，退出0。
- [x] 三次2000用户30秒预热＋180秒诊断：只合并写刷新27.03%，缩小查询75.12%，再合并只读下一轮100%；保留前两次失败，见报告第5.2节。
- [x] 全量 `make ci` 215项、strict类型检查及全部构建通过；故意超时／空测量均退出1，正常短测退出0。
- [x] 2000用户5分钟预热＋30分钟稳态（预热内20秒分批接入），原种子1001806、业务比例和思考时间；264615交易及105899目录请求全部达标，排空后8000注册及客户端一致，退出0，原始JSON见报告第5.2节。
- [x] 测试报告、迭代、追溯、history及发布候选记录同步；文档／卫生／Action固定SHA及 `git diff --check` 通过，实测JSON时长、全2000活跃用户、门槛与排空独立核对通过，随机数据库剩余0。本地工作与正式交付状态分开。

## 风险与决策

- 简单共享已开始的HTTP会使用请求到达前的观察；只共享尚未开始的下一轮，运行期间的新调用进入后继轮。
- 后台轮询与准入写共享一轮时，应用资格取所有调用的并集；已准入写仍各自持有token直到事务完成。只有后台的轮次在关闭期间不写库。
- 每轮失败拒绝该轮全部调用，后继轮仍能推进；同学期最多一轮运行、一轮待开始。
- 只读目录按学期＋教授标识隔离并共享尚未开始的HTTP／投影，不复用已完成结果或触发镜像应用；缩小字段选择与有效人数计数保持DTO及业务语义。见ADR-003。
- 队列合并不能承诺2000档必过；若正式测量仍失败，保留未关闭状态及实际结果，不调整门槛。

## 实测结果与交付记录

本次Linux同机分进程完整2000档通过；PERF-01修复已合入，待独立复核。总交易p95 6413.64ms、最大9923.79ms，不承诺更大规模／真实网络。40用户1ms负向测试仍15名客户端确认集合差异，超时后重新读取另属PERF-02，本轮不扩展产品范围。

用户后续授权的提交、push、merge commit已执行：[原提交 80d0142](https://github.com/Nichengjin/software-engineering-project/commit/80d0142edb1f406c121c706b6df21ece27846be9) 为倪成锦Author／Amp Committer；[PR #25](https://github.com/Nichengjin/software-engineering-project/pull/25) 于Asia/Shanghai 21:10:12以 [两父merge commit 5d3690b](https://github.com/Nichengjin/software-engineering-project/commit/5d3690b38cba8f4705240168e99aa1cd0079c417) 合入main，父节点为原main与原提交，保留完整历史。

[PR CI](https://github.com/Nichengjin/software-engineering-project/actions/runs/37625656581) 215测试、strict类型检查、全部构建及Markdown 0 errors通过；[供应链检查](https://github.com/Nichengjin/software-engineering-project/actions/runs/37625656516) 通过。实际合入状态同步报告、ADR、IT-04、history和追溯，不将用户集中合入补记成独立成员审批。

合入后 [main CI](https://github.com/Nichengjin/software-engineering-project/actions/runs/37626410721) 在两父合并节点上再次通过215项、类型检查、构建及Markdown检查；工作流成功。不触发发布工作流。

未发布或部署；US-018整体仍进行中，Windows／Edge、独立机器与七天可用性及团队评审仍待办。
