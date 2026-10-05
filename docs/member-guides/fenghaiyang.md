# 冯海洋：教务端角色指南

- 成员标识：`fenghaiyang`
- 既有分支：`feat/fenghaiyang/us-023-people-imports`（#17）、`feat/fenghaiyang/us-021-term-windows`（#18）、`feat/fenghaiyang/us-022-close-supplement`（#21）
- 范围：人员与导入、学期窗口、关闭结果和补选界面。

本轮不要创建替代 PR、更新旧 PR 或运行 `member-pr.mjs --apply`。没有新任务时，评审删除影响、表格逐行反馈、窗口边界、关闭／补选状态与错误提示；只记录实际检查和未测项。

未来新工作示例：

```powershell
git switch main
git pull --ff-only origin main
git switch -c feat/fenghaiyang/us-NNN-short-slug
git config user.name "冯海洋"
git config user.email "本人确认的邮箱"
```

从最新 `main` 开始并关联真实需求／迭代；完成修改、测试、文档和 history 后，由本人逐文件暂存、commit、push 并创建 Draft PR。无任务或认证时不操作。
