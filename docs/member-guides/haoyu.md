# 浩宇：学生端角色指南

- 成员标识：`haoyu`
- 既有分支：`feat/haoyu/us-004-web-shell`（#11）、`feat/haoyu/us-006-student`（#16）
- 范围：登录交互、课表编辑／提交／加退选、成绩单。

本轮不要创建替代 PR、更新旧 PR 或运行 `member-pr.mjs --apply`；组长按 #6—23 顺序集中合并原 PR。你没有新任务时，评审登录／首次改密／注销、主备选、版本冲突、时间边界和成绩单，记录实际结果与未测项，不制造提交。

未来收到新需求后，从最新 `main` 建新分支：

```powershell
git switch main
git pull --ff-only origin main
git switch -c feat/haoyu/us-NNN-short-slug
git config user.name "浩宇"
git config user.email "本人确认的邮箱"
```

先登记需求与迭代，完成真实修改、测试、文档和 history，再逐文件暂存、commit、push，由本人已认证 GitHub 账号创建 Draft PR。缺少任务、权限或本人认证就停止。
