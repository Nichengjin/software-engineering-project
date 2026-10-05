# 范昭：外部系统与交付角色指南

- 成员标识：`fanzhao`
- 既有分支：`chore/fanzhao/us-027-workspace`（#7）、`chore/fanzhao/us-027-runtime-seed`（#9）、`feat/fanzhao/us-016-simulators`（#12）、`feat/fanzhao/us-016-billing`（#19）、`ci/fanzhao/us-027-checks`（#23）
- 范围：workspace、seed／运行、目录与计费模拟、账单重试、CI 和交付环境。

本轮不要创建替代 PR、更新旧 PR 或运行 `member-pr.mjs --apply`。没有新任务时，复核安装、迁移、seed、模拟持久化／幂等、计费恢复和交付步骤；checks 失败须如实记录，不通过关闭门禁来“修复”。

未来新工作示例：

```powershell
git switch main
git pull --ff-only origin main
git switch -c chore/fanzhao/us-NNN-short-slug
git config user.name "范昭"
git config user.email "本人确认的邮箱"
```

关联真实需求／迭代并完成修改、验证、文档与 history 后，由本人逐文件暂存、commit、push、创建 Draft PR。不得上传环境凭据、数据库或模拟状态。
