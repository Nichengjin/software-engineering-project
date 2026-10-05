# 冯海伦：独立测试角色指南

- 成员标识：`fenghailun`
- 未来分支：`test/fenghailun/us-018-acceptance`
- 状态：独立验收**尚未完成**，没有既有 PR 可替换。

本轮不要运行 `member-pr.mjs --apply`，不要创建空 PR。基于组长确认的已合入 `main` 提交，在独立数据库、独立 `_test` 库和独立模拟状态执行 `docs/TEST_PLAN.md` 与 `docs/testing/acceptance-cases.md`。记录候选 SHA、环境、预期、实际结果、通过／失败／未测、缺陷与回归；开发自测、短时检查或 Agent 执行不能伪装成本人独立验收。

真正开始验收时：

```powershell
git switch main
git pull --ff-only origin main
git switch -c test/fenghailun/us-018-acceptance
git config user.name "冯海伦"
git config user.email "本人确认的邮箱"
git rev-parse HEAD
```

只有产生真实的用例修订、复现测试或报告后，才逐文件暂存，提交并 push，由本人已认证账号创建 Draft PR。测试失败也可如实提交；环境不足就记录阻塞，不声称通过。
