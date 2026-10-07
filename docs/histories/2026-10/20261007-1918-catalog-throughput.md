## [2026-10-07 19:18 Asia/Shanghai] | Task: US-018 目录吞吐修复与Linux复测

### 🤖 Execution Context

- **Agent ID**: Amp；[执行线程](https://ampcode.com/threads/T-01a115eb-a415-74a3-a081-1fb0ea0d3575)。
- **Base Model**: 会话未提供可核实模型标识，不推断。
- **Runtime**: Linux orb、Node26.10.0、PostgreSQL15；倪成锦负责，Amp执行。

### 📥 User Query

> 从最新远程代码开倪成锦的新分支；先检查Linux orb能否避免macOS瞬时2000连接重置，再按“一轮运行、一轮共享等待”的方案修目录同步，复测是否仍有120秒超时。

### 🛠 Changes Overview

**Scope:** API目录服务、目录测试、独立负载进程及US-018记录。

- 最新main基线为 [d7046aa](https://github.com/Nichengjin/software-engineering-project/commit/d7046aaf0f16168e0d397b92dc9a420dd1afa269)，本地分支 `fix/nichengjin/us-018-catalog-throughput`。
- 同学期写刷新只合并尚未开始的下一轮，保留镜像发布顺序、准入与关闭排空、版本复查、失败恢复；只读下一轮按学期＋教授隔离，不缓存已完成结果或应用镜像。
- 查询只取revision／observedAt、有效注册计数及涉及的选课班次，目录投影按Map查标识；保持DTO、容量与事务规则，全局写锁未改。
- 负载客户端、API、HTTP模拟各独立Node进程；临时配置通过私有IPC，真实PG和业务时钟沿用夹具。保留失败分母、真实换第四门课和先排空再终态校验。
- 记录Linux无数据库TCP对照，未调大内核、池或超时；同机拓扑不是独立服务器容量认证。

### 🧠 Design Intent (Why)

逐请求串行HTTP使等待随并发人数增长；共享已开始的HTTP又不满足请求到达后的新鲜度边界。共享下一轮降低同步次数而保留该边界。第一轮只合并写刷新仍失败，第二轮缩小查询仍失败，第三轮加入只读下一轮才通过短诊断，不能只实现最初猜测后宣称瓶颈消失。

### 验证与局限

- 修复前刷新屏障6项中4项失败；只读合并复现原实现2002次外部请求而非期望2次。修复后7项目录测试及真实PG投影回归通过，定向38项通过。
- 全量 `make ci`：13文件／215测试、strict类型检查、全部生产构建通过，测试阶段219.07秒。
- Linux原生Node／Hono、瞬时／2秒分散、各2000新连接均成功，瞬时仍有监听溢出，分散无溢出。没有复现macOS connect重置，不宣称Linux没有TCP限制。
- 2000用户30秒预热＋180秒短诊断依次27.03%、75.12%、100%，原种子／业务比例／思考时间／120秒期限；最后一轮26996交易及10774目录请求达标，排空后8000注册且客户端一致。前两轮失败保留。
- 三进程工具自检669笔成功；故意1ms超时和空测量均预期退出1，超时后排空无活动刷新、课表与注册一致，但15名客户端集合差异，不能将超时当作业务未提交，PERF-02待复核。
- 正式2000用户300秒预热＋1800秒稳态、预热内20秒分批启动：退出0，264615／264615交易成功且≤120秒，105899／105899目录成功且≤10秒，排空后8000注册与客户端零错配；各诊断阶段活动数及失败数0。稳态19:24:15.525—19:54:15.526，总交易p95 6413.64ms、max 9923.79ms、刷新max 3965.66ms，API峰值834.85MiB。命令和原始JSON见报告第5.2节。
- 未复测Windows／Edge、500用户正式档、七天可用性或独立机器启动；不替代团队评审、完整AC或冯海伦独立验收。

### 📁 Files Modified

- `apps/api/src/modules/catalog/service.ts`、`apps/api/test/catalog.test.ts`、`apps/api/test/backend.integration.test.ts`。
- `tests/acceptance/fixture.ts`、`tests/load/nfr01-03.ts`、`process.ts`、`worker.ts`、`tcp-control.ts`、`README.md`。
- `docs/TEST_REPORT.md`、ADR-003及后端详细设计、修复计划、IT-04、追溯矩阵与发布候选记录。

### 交付状态

候选形成时本地修复与完整复测通过、未远程交付；用户后续授权提交、push及merge commit合入main。倪成锦Author／Amp Committer的 [原提交 80d0142](https://github.com/Nichengjin/software-engineering-project/commit/80d0142edb1f406c121c706b6df21ece27846be9) 已推送，经 [PR #25](https://github.com/Nichengjin/software-engineering-project/pull/25) 于Asia/Shanghai 21:10:12以 [merge commit 5d3690b](https://github.com/Nichengjin/software-engineering-project/commit/5d3690b38cba8f4705240168e99aa1cd0079c417) 合入。实际两父节点核对通过，原提交完整保留；未伪造成员独立评审。

[PR CI](https://github.com/Nichengjin/software-engineering-project/actions/runs/37625656581) 215项、strict类型检查、全部构建与Markdown 0 errors及 [供应链检查](https://github.com/Nichengjin/software-engineering-project/actions/runs/37625656516) 通过。同步报告、ADR、IT-04、追溯及发布候选的合入状态，未改产品或重跑35分钟测量。

合入后 [main CI](https://github.com/Nichengjin/software-engineering-project/actions/runs/37626410721) 再次215项通过，类型检查、构建和Markdown 0 errors通过；完整合并节点已验证。

未发布或部署。US-018保持进行中；原macOS失败保留，PERF-01修复已合入待独立复核，不外推生产容量；PERF-02、完整AC／NFR和课程交付未因此完成。
