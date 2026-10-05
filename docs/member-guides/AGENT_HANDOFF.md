# Agent 交接指令：从克隆开始

把本文件完整交给编程 Agent。关联 US-002／IT-01，决策日期 2026-10-05。

已保留的团队确认：用户确认六人组队合规，教师后续课堂口头取消先前 AI 使用限制。仍须保留 AI 来源和真实工作记录；该确认不代表评审、测试、外部模拟系统接受或发布完成。

## 1. 只问一次姓名

执行命令前只问：

> 你是倪成锦、浩宇、马喆、冯海洋、冯海伦、范昭中的哪一位？

无法唯一匹配就停止，不猜身份。姓名只用于分配角色，**不等于 GitHub 认证或人类授权**；需要登录、Write 权限或人工确认时如实报告，不索取密码、token 或密钥。

| 姓名 | 标识 | 角色 | 已有原 PR |
| --- | --- | --- | --- |
| 倪成锦 | `nichengjin` | 组长、架构与集成 | #6、#8、#10、#13、#14、#20、#22 |
| 浩宇 | `haoyu` | 学生端 | #11、#16 |
| 马喆 | `mazhe` | 教授端 | #15 |
| 冯海洋 | `fenghaiyang` | 教务端 | #17、#18、#21 |
| 冯海伦 | `fenghailun` | 独立测试 | 无；独立验收尚未完成 |
| 范昭 | `fanzhao` | 外部系统、运行与交付 | #7、#9、#12、#19、#23 |

## 2. 读取实时状态并克隆

仓库固定为 `https://github.com/Nichengjin/software-engineering-project.git`。检查 Git、Node.js 22.12+ 和 `gh`；用 `gh api user --jq .login` 读取当前账号，不把姓名当登录证明。随后读取 #6—23 的实时 `state`、`isDraft`、`mergedAt`、head 和 checks。已合入的原任务跳过，不重开、不复制、不创建替代 PR。

先检查 `main` 是否已有 `scripts/member-pr.mjs`：

```powershell
gh api repos/Nichengjin/software-engineering-project/contents/scripts/member-pr.mjs?ref=main --silent
```

成功则克隆最新 `main`：

```powershell
git clone --branch main https://github.com/Nichengjin/software-engineering-project.git wylie-work
```

若文件尚未进入 `main` 且 #23 尚未合入，才从完整候选分支克隆：

```powershell
git clone --branch ci/fanzhao/us-027-checks https://github.com/Nichengjin/software-engineering-project.git wylie-work
```

若 #23 已合入但 `main` 仍无脚本，停止并核对远端，不猜来源。已有同名目录时不 reset、clean 或覆盖；改用新目录。进入仓库后读取 `AGENTS.md`、`docs/TEAM_ROLES.md`、`docs/GIT_WORKFLOW.md` 和协作计划。

## 3. 本轮只处理原 PR，不造替代 PR

最新决定是：成员本轮无法参与，组长获授权按 **#6、#7……#23 数字顺序**，用 merge commit 集中处理现有 PR。合入由组长统一执行；成员 Agent 不重复合并、不声称未核实的检查通过。不得运行：

```powershell
node scripts/member-pr.mjs MEMBER --login LOGIN --apply
```

`scripts/member-pr.mjs` 只是 2026-10-05 曾设计的“原 PR 成员接手”工具，不是常规开发脚手架。本轮不用它，不新建 `-member-pr` 分支，不关闭或复制 #6—23。保留原提交 Author、Committer、时间、AI 来源和 PR 创建者事实；组长集中合并不等于其他成员独立开发、审阅或测试。

## 4. 没有新任务时做什么

不得为凑贡献编造修改、空提交、测试结果或 PR。没有分配新任务时，只给出以下待办：

- 倪成锦：核对 #6—23 依赖、实时 checks 与合并结果；只记录实际结果。
- 浩宇：评审学生端登录、课表、加退选和成绩单；记录未测项。
- 马喆：评审授课选择、名册和成绩录入。
- 冯海洋：评审人员导入、学期窗口、关闭与补选界面。
- 范昭：复现安装、迁移、seed、模拟、计费恢复和交付环境。
- 冯海伦：在独立环境执行 AC／NFR 并形成真实报告；此项仍未完成，开发自测不能代替。

这些是责任安排，不是已完成声明。成员不能参与时，标记“待执行”。

## 5. 未来真正的新工作

仅在组长明确分配新任务后：从最新 `main` 新建 `<type>/<member>/<需求编号>-<slug>`；确认 backlog 需求和迭代文件；做真实修改；补测试、文档和 history；运行适用验证；以本人合法 Git 身份 commit、push；由本人已认证的 GitHub 账号创建 Draft PR。Windows PowerShell 示例：

```powershell
git switch main
git pull --ff-only origin main
git switch -c feat/haoyu/us-NEW-short-slug
git config user.name "浩宇"
git config user.email "本人确认的邮箱"
# 修改、测试并逐个检查文件后：
git add -- path/to/changed-file docs/histories/YYYY-MM/YYYYMMDD-HHmm-task.md
git diff --cached
git commit -m "feat(scope): 描述真实改动" -m "Refs: US-NEW"
git push -u origin feat/haoyu/us-NEW-short-slug
gh pr create --base main --head feat/haoyu/us-NEW-short-slug --draft
```

不得原样使用占位符。缺少本人认证、邮箱确认、人类许可或真实任务就停止；姓名不能替代这些条件。不得强推、改写旧作者或把未执行验证写成通过。

## 6. 返回结果

简要报告：姓名与角色、读取到的实时 PR 状态、跳过的已合入任务、实际执行的命令／检查、未测项和阻塞。明确区分“已存在 PR”“已合入”“CI 通过”“独立验收完成”；没有证据就不宣称。
