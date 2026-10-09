# 个人报告新增图表与来源

- 日期：2026-10-09；关联需求：US-028；迭代：IT-04。
- 用途：为六份个人报告补充12张解释流程、交互顺序与已有测试结果的图。每份报告新增两张，图片位于本人目录的 `attachments/`，正文在相应章节引用。
- 统计图来自已有测试记录；流程图与交互图依据现有规则、实现和正文示例绘制。此次绘图没有产生新的业务测试结果。

## 图表索引

| 报告及位置 | PNG | 可编辑来源 | 内容依据 |
| --- | --- | --- | --- |
| 倪成锦3.4，图2 | [关闭选课处理顺序](../nichengjin/attachments/figure-close-order.png) | [DOT](../nichengjin/attachments/figure-close-order.dot) | [后端详细设计](../../design-docs/backend-detail.md)中的准入、等待、关闭事务与outbox |
| 倪成锦7.4，图3 | [三轮目录刷新短测](../nichengjin/attachments/figure-refresh-stages.png) | [数据](refresh-stages.csv)、[R脚本](performance-plots.R) | [测试报告](../../TEST_REPORT.md)第5.2节三轮短诊断，见下表 |
| 浩宇4.1，图2 | [双页面版本时序](../haoyu/attachments/figure-multi-page.png) | [SVG](../haoyu/attachments/figure-multi-page.svg)、[生成脚本](render.mjs) | 正文v51／v52示例与[版本处理](../../../apps/web/src/lib/hooks.ts) |
| 浩宇4.2，图4 | [旧响应晚到](../haoyu/attachments/figure-stale-response.png) | [SVG](../haoyu/attachments/figure-stale-response.svg)、[生成脚本](render.mjs) | 正文v7／v8示例与[版本测试](../../../apps/web/src/lib/hooks.test.ts) |
| 马喆4.2，图1 | [授课调整与回滚](../mazhe/attachments/figure-teaching-transaction.png) | [DOT](../mazhe/attachments/figure-teaching-transaction.dot) | [授课服务](../../../apps/api/src/modules/teaching/service.ts)，A、B改为A、C为正文示例 |
| 马喆5.3，图3 | [逐格录分结果](../mazhe/attachments/figure-grade-results.png) | [DOT](../mazhe/attachments/figure-grade-results.dot) | [验收用例](../../../tests/acceptance/scenarios.integration.test.ts)的十格输入；八格合法、一格空白、一格Z |
| 冯海洋3.3，图1 | [状态修改预览与确认](../fenghaiyang/attachments/figure-status-preview.png) | [DOT](../fenghaiyang/attachments/figure-status-preview.dot) | [人员服务](../../../apps/api/src/modules/people/service.ts)与正文的预览、复核、事务处理 |
| 冯海洋4.1，图2 | [名单导入处理](../fenghaiyang/attachments/figure-import-rows.png) | [DOT](../fenghaiyang/attachments/figure-import-rows.dot) | [导入服务](../../../apps/api/src/modules/imports/service.ts)、[文件解析](../../../apps/api/src/modules/imports/xlsx.ts) |
| 冯海伦7.2，图1 | [原macOS长测结果](../fenghailun/attachments/figure-load-outcomes.png) | [数据](load-outcomes.csv)、[R脚本](performance-plots.R) | [测试报告](../../TEST_REPORT.md)第5节，2026-10-06原2000用户档 |
| 冯海伦7.3，图2 | [终态取数顺序](../fenghailun/attachments/figure-terminal-snapshot.png) | [DOT](../fenghailun/attachments/figure-terminal-snapshot.dot) | [测试报告](../../TEST_REPORT.md)中的TEST-06修正与[负载工具](../../../tests/load/nfr01-03.ts) |
| 范昭4.2，图2 | [接收后断连与重试](../fanzhao/attachments/figure-billing-retry.png) | [SVG](../fanzhao/attachments/figure-billing-retry.svg)、[生成脚本](render.mjs) | [模拟存储](../../../apps/simulators/src/store.ts)与正文4.1—4.3、5.1的重试规则 |
| 范昭5.3，图3 | [账单版本与当前金额](../fanzhao/attachments/figure-billing-versions.png) | [SVG](../fanzhao/attachments/figure-billing-versions.svg)、[生成脚本](render.mjs) | 同一学生、同一学期的v1=1200元、v2=1500元示例；旧版到达不回退金额 |

所有图另存SVG。流程图的DOT、交互图的SVG以及统计图的CSV与R脚本可继续编辑。原有页面截图与共享模型图继续引用，截图采集说明保留在各报告中。

## 统计图口径

### 三轮目录刷新短测

三个结果来自同一Linux环境下逐步修改的短诊断：2000用户、30秒预热、180秒测量，客户端、API、模拟服务为三个独立进程。成功必须同时满足业务成功且耗时不超过120秒，分母包含该轮发起的全部交易。虚线为80%要求。

| 轮次 | 累计修改 | 成功且在120秒内 | 全部交易 | 比例 |
| --- | --- | --- | --- | --- |
| 第一轮 | 合并写请求刷新 | 2185 | 8085 | 27.03% |
| 第二轮 | 再缩小字段、计数与班次查询范围 | 6363 | 8471 | 75.12% |
| 第三轮 | 再合并只读目录请求 | 26996 | 26996 | 100.00% |

比例由CSV中的分子、分母计算，显示到两位小数。不同轮次的交易总数不同，图中同时列出分子和分母；没有将原macOS长测与后续Linux正式长测混入此图。短诊断用于观察方案效果，正式长测结果仍在报告7.5节单独说明。

### 原macOS 2000用户长测

数据采集日期为2026-10-06，5分钟预热、30分钟测量，API、数据库、模拟服务和压测端都在同一台Mac。

| 类别 | 笔数 | 占全部交易 |
| --- | --- | --- |
| 成功且在120秒内完成 | 61939 | 63.04% |
| 客户端超时 | 20611 | 20.98% |
| 网络错误 | 15702 | 15.98% |
| 合计 | 98252 | 100.00% |

类别沿用客户端记录。超时后服务端继续处理，不把原客户端失败改记为成功；网络错误也不从该图进一步推断底层原因。该图只展示原macOS结果，不作为与Linux的单因素性能对照。

## 重新生成

使用本机已有的Node.js、Graphviz、librsvg和R，中文字体为PingFang SC。流程图由Graphviz布局，交互图用SVG控制泳道位置，数据图使用R基础绘图。R脚本当前的PNG设备为macOS Quartz。

在仓库根目录运行：

```sh
node docs/work-reports/figure-sources/render.mjs
```

该命令读取两个CSV，重新生成12组PNG／SVG、六份DOT，并更新[图表清单](manifest.json)。生成脚本包含流程定义与交互图文字；要保留持续修改，应编辑生成脚本或统计数据，再重新运行。单独改导出的SVG／DOT不会自动反写脚本。

PNG以两倍图形尺寸或2400×1400像素输出，适合报告阅读及后续Word导出。图源不依赖远程服务或项目运行数据库。
