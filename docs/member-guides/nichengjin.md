# 倪成锦：组长角色指南

- 成员标识：`nichengjin`
- 既有分支／PR：`docs/nichengjin/us-026-design`（#6）、`feat/nichengjin/us-026-data-contracts`（#8）、`feat/nichengjin/us-004-auth`（#10）、`feat/nichengjin/us-005-catalog`（#13）、`feat/nichengjin/us-007-schedules`（#14）、`feat/nichengjin/us-015-closing`（#20）、`feat/nichengjin/us-027-integration`（#22）。

## 本轮集中合并

成员无法参与，用户授权组长集中处理**现有 #6—23**。先读取实时状态，已合入的跳过；其余严格按数字顺序逐个核对 checks、草稿／可合并状态和当前差异，再使用 **Create a merge commit**。不创建替代 PR，不运行 `member-pr.mjs --apply`，不 squash／rebase，不重写原作者或把集中操作记成成员独立参与。以真实 GitHub 记录核对结果，本指南本身不证明任何 PR 已合入或 CI 已通过。

冯海伦独立验收仍未完成。成员缺席时不能补造审批、测试、贡献或个人提交；把相关责任保留为待办。

## 未来新工作

新任务从最新 `main` 新建短期分支：

```powershell
git switch main
git pull --ff-only origin main
git switch -c feat/nichengjin/us-NNN-short-slug
git config user.name "倪成锦"
git config user.email "本人确认的邮箱"
```

先建立需求与迭代记录，再做真实修改、测试、文档和 history；逐文件暂存、commit、push，以本人认证账号创建 Draft PR，并安排作者之外的人评审。只有真实证据才能更新追溯、完成状态和发布记录。
