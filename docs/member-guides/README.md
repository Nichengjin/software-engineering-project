# 成员入门

关联 US-002／IT-01，更新于 2026-10-05。优先把 [统一 Agent 指令](AGENT_HANDOFF.md) 完整交给编程 Agent；它会只问一次姓名并读取实时 PR 状态。

用户已确认六人组队合规，教师后续课堂口头取消先前 AI 使用限制。保留 AI 来源与真实工作记录；这不证明评审、测试或发布完成，外部模拟系统的课程接受口径仍待单独确认。

## 本轮状态

- 组员本轮无法参与，组长获授权集中处理**现有** #6—23。
- 2026-10-05 已按 #6、#7……#23 顺序，以 merge commit 全部合入 main；[实际记录](../exec-plans/active/2026-10-05-collaboration-history.md#10-实际合入确认)。现在从 main 克隆，原任务无需重复处理。
- 不创建成员替代 PR，不运行 `scripts/member-pr.mjs ... --apply`，不关闭原 PR。
- 原提交作者、提交者、日期与 AI 来源保持不变。集中合并不是成员独立开发或测试的证明。
- 冯海伦独立验收仍待执行；不能用开发自测代替。

## 六人入口

| 姓名 | 角色指南 | 现有分支／PR 范围 |
| --- | --- | --- |
| 倪成锦 | [组长](nichengjin.md) | #6、#8、#10、#13、#14、#20、#22 |
| 浩宇 | [学生端](haoyu.md) | #11、#16 |
| 马喆 | [教授端](mazhe.md) | #15 |
| 冯海洋 | [教务端](fenghaiyang.md) | #17、#18、#21 |
| 冯海伦 | [独立测试](fenghailun.md) | 无既有实现 PR |
| 范昭 | [外部系统与交付](fanzhao.md) | #7、#9、#12、#19、#23 |

没有新任务时只做指南中的评审／测试责任，不制造代码、提交或 PR。

## 未来新任务的统一流程

真正分配新需求后，先准备 Git、Node.js 22.12+、`gh`，并以本人 GitHub 账号认证。缺少认证或 Write 权限时联系组长；中文姓名不是平台权限。

```powershell
git clone --branch main https://github.com/Nichengjin/software-engineering-project.git wylie-work
Set-Location wylie-work
git pull --ff-only origin main
git switch -c feat/MEMBER/us-NNN-short-slug
git config user.name "本人真实姓名"
git config user.email "本人确认的邮箱"
```

分支名必须使用个人指南中的成员标识。新工作须关联 backlog 需求和迭代，包含真实修改、适用测试、同步文档与 history；逐个 `git add -- <path>`，检查 `git diff --cached` 后 commit、push，再由本人认证账号创建 Draft PR。没有新任务或修改就不提交。

不得上传 `.env`、token、初始密码、数据库或运行状态；不得强推、rebase 共享历史、借用他人账号，或宣称未执行的 CI、评审、验收和发布已完成。
