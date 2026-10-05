# 马喆：教授端角色指南

- 成员标识：`mazhe`
- 既有分支：`feat/mazhe/us-009-teaching-grades`（#15）
- 范围：授课选择、名册、成绩录入服务与页面。

本轮不要创建替代 PR、更新旧 PR 或运行 `member-pr.mjs --apply`；组长集中处理原 #15。没有新任务时，评审授课资格／冲突、名册只含正式注册、所有权和成绩值校验，记录真实结果及未测项，不制造提交。

未来新工作从最新 `main` 开始：

```powershell
git switch main
git pull --ff-only origin main
git switch -c feat/mazhe/us-NNN-short-slug
git config user.name "马喆"
git config user.email "本人确认的邮箱"
```

需求和迭代必须存在；完成真实修改、验证、文档与 history 后，逐文件暂存并由本人 commit、push、创建 Draft PR。姓名不能替代认证或权限。
