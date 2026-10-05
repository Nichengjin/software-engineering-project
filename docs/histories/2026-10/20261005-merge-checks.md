# 集中合入前修复检查阻塞

关联 US-027／IT-02，协作授权关联 US-002／IT-01。用户授权推送并按依赖以 merge commit 合入既有 PR #6—23，不新建成员替代 PR、不重写原实现提交。

- 课程原文转换中的粗体小标题改为正确层级的 Markdown 标题，多余空行由 markdownlint 修复；保留课件正文，不按后续口头确认改写课程来源。MD024 检查同父级重复标题，允许不同用例各自有“基本流程／前置条件”等结构；没有关闭全量 Markdown 检查。
- 本仓库 Dependency Review 实际报能力不支持。private 仓库改用完整 lockfile 的 npm high 门禁，保留 OSV；public 仓库保留原 Action。替代不提供许可证增量比较，不宣称等价，也不改外部安全设置。
- 全量 Markdown 检查 84 文件为 0 issues；三个课程文件独立去除标题／强调标记与空白后，正文与原提交完全相同。`make check-repo`、Action SHA 检查与差异卫生检查通过。
- 本次准备不代表 PR 已合入、团队已评审、独立测试已完成或已经发布。依赖修复与实际验证结果随执行补充。

## 依赖修复

Prisma6 配置层的 deepmerge-ts 升至 8.0.2，ExcelJS 的 uuid 升至仍提供 CommonJS 的 11.1.1；使用按消费者限定的 overrides，不全局覆写其他消费者、不升级 Prisma 主版本。两者分别修复 GHSA-ggr8-5vv4-36mx／GHSA-w5hq-g745-h8pq，许可证仍为 BSD-3-Clause／MIT。npm10 的首次 lock-only install 没有更新既有嵌套版本，`npm ls` 正确拒绝；使用定向 `npm update deepmerge-ts uuid --package-lock-only --ignore-scripts` 后重新 locked install。

`npm ci` 与 `npm audit --package-lock-only --audit-level=high` 为 0 vulnerabilities，`npm ls` 核对实际版本。ExcelJS 创建 dataBar 条件格式并写出／重新读取，精确断言文本、数值与规则类型通过，覆盖原 uuid.v4 的实际调用。完整业务回归的授课时间问题另行复现修复，不以审计通过代替业务测试。
