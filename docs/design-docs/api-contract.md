# 学生选课系统 HTTP 契约

- 版本：v0.1，2026-10-05；US-026／IT-02。
- 状态：用户授权下的实现契约初稿；不是团队评审或已实现接口。
- 输入：[需求 v0.6](../REQUIREMENTS_ANALYSIS.md)、[OOA v0.3](object-oriented-analysis.md)。运行、事务与字段存储见 [总体设计](system-design.md)。业务规则冲突时先修设计，不能静默修改需求。
- `packages/contracts` 后续按本文实现共享 DTO 与运行时校验；前后端先按以下路径、字段与枚举并行。接口不直接返回 Prisma 记录。

## 1. 公共约定与认证

API 前缀 `/api`，JSON UTF-8；只有导入用 multipart。ID 为不透明字符串，外部 courseId／offeringId 原样保留；日期 `YYYY-MM-DD`，时间为带 Z 的 ISO 8601 UTC，界面按 Asia/Shanghai 显示。金额用十进制字符串表示元，学分也用字符串，计算禁止二进制浮点。数组顺序有意义，备选按数组下标优先。未知输入字段拒绝，空数组不等于省略字段。

计费先精确合计全部最终班次学分，再乘每学分单价，最后一次按元保留两位小数，采用正数四舍五入（half-up）；不逐班舍入后求和。例如 3.50 学分 × 125.55 元＝439.425 元，应收 439.43 元。此口径由统筹于 2026-10-05 根据自主决策授权补充，主系统与模拟系统必须一致。

```ts
type ID = string;
type Instant = string;
type Role = 'STUDENT' | 'PROFESSOR' | 'REGISTRAR';
type Grade = 'A' | 'B' | 'C' | 'D' | 'F' | 'I';
type StudentStatus = 'ACTIVE' | 'SUSPENDED' | 'GRADUATED';
type ProfessorStatus = 'ACTIVE' | 'DEPARTED';
type CloseState = 'OPEN' | 'CLOSING' | 'CLOSED';
type Phase = 'BEFORE_TEACHING' | 'TEACHING' | 'INITIAL' | 'GAP'
  | 'ADD_DROP' | 'AWAITING_CLOSE' | 'CLOSING' | 'CLOSED';
type Success<T> = { data: T; requestId: string; serverTime: Instant };
type Issue = { field?: string; offeringId?: ID; studentId?: ID;
  row?: number; code: string; message: string };
type Failure = { error: { code: string; message: string; issues: Issue[];
  currentVersion?: number; retryable: boolean }; requestId: string };
type User = { id: ID; account: string; name: string; role: Role;
  personId: ID | null; mustChangePassword: boolean };
type Auth = { user: User; csrfToken: string; expiresAt: Instant };
```

成功默认 200；创建 201；关闭接收 202；所有响应（含失败）有 `X-Request-ID`。无业务结果也返回 `{data:{...}}`，不混用裸 JSON 和 204。认证及人员／成绩响应 `Cache-Control: no-store`。

| HTTP | error.code | 含义及前端处理 |
| --- | --- | --- |
| 400 | INVALID_INPUT / INVALID_FILE | JSON、结构或文件不可解析；issues 指字段／行 |
| 401 | UNAUTHENTICATED / INVALID_CREDENTIALS | 会话缺失过期或统一的登录失败提示，不区分账号存在与否 |
| 403 | FORBIDDEN / PASSWORD_CHANGE_REQUIRED / ACCOUNT_DISABLED / CSRF_FAILED | 角色、所有权、人员状态、首次改密或 CSRF 禁止 |
| 404 | NOT_FOUND | 合法权限下对象不存在；越权名册先 403，不返回名单 |
| 409 | STALE_VERSION / CLOSING / ALREADY_CLOSED / PHASE_FORBIDDEN / OFFERING_FULL / OFFERING_TAKEN / HAS_RECORDS / IMPACT_CHANGED / CATALOG_CHANGED | 业务状态竞争；旧版本提示重新读取，不自动重提 |
| 422 | RULE_VIOLATION | 数量、先修、冲突、重复课程、时间顺序等，逐项 issues；整份提交失败 |
| 413 | FILE_TOO_LARGE | xlsx 限额超出 |
| 503 | CATALOG_UNAVAILABLE / DATABASE_UNAVAILABLE / RECOVERING | 明确外部或基础设施不可用，不冒充空结果 |
| 500 | INTERNAL_ERROR | 内部故障，无堆栈／SQL／凭据；查 requestId |

`retryable` 只说明故障可恢复，不授权自动重复非幂等操作。401 导向登录；403 提示权限；409 STALE_VERSION 保留本地未提交编辑供用户对照，重新读服务器版本，不用本地覆盖新结果。

认证采用数据库持久化 opaque session cookie `sid`（随机 256 位、数据库存 SHA-256 摘要），HttpOnly、SameSite=Lax、Path=/、生产 HTTPS Secure，绝对有效期 12 小时。浏览器 `credentials: 'include'`；每个改变状态的请求除登录外带 `X-CSRF-Token`，检查会话 CSRF 摘要及同源 Origin，登录也校验同源。开发 Vite 代理 `/api` 到 API，交付由 Hono 同源托管 SPA；不开放任意 CORS，不在 localStorage 放凭据。每请求重新检查账户启停与人员状态，不只信登录时缓存的 role。

csrfToken 由 `HMAC-SHA256(CSRF_SIGNING_KEY, session.tokenHash)` 确定性派生，数据库保存其摘要；GET me 可重新派生相同 token，不能只存随机 token 的摘要后又声称能恢复原值。改密轮换 session 后一并轮换 CSRF。签名密钥由环境注入，重启保持一致。

| 方法／路径 | 权限 | 请求 | `data` 响应 |
| --- | --- | --- | --- |
| POST `/auth/login` | 未认证，同源 | `{account,password}` | `Auth` 并设置 cookie；首次登录只许读 me、改密、退出 |
| GET `/auth/me` | 会话 | 无 | `Auth`，可在刷新后恢复 CSRF 和身份 |
| POST `/auth/change-password` | 会话，含初始会话 | `{currentPassword,newPassword}` | `Auth`，废止该账户旧会话并轮换当前 cookie／CSRF |
| POST `/auth/logout` | 会话 | `{}` | `{loggedOut:true}`，删除会话并清 cookie |
| GET `/health/live` | 无 | 无 | `{status:'ok'}`，不泄露环境 |
| GET `/health/ready` | 无 | 无 | `{status:'ready'}`；恢复未结束或 DB 不可用则 503 |

密码至少 10、至多 128 字符，Node scrypt 独立随机盐，恒时比较；所有新人员初始密码独立随机。只有创建／导入成功时向已授权教务员一次性显示初始凭据（UC-08／09／14 必需的交付），不得作为后续人员查询字段，也不落明文数据库、日志或仓库样例。自动测试用运行时生成的凭据。改密、停用、离职撤销已有会话；休学／毕业会话可保留但权限即时缩为成绩查询。

## 2. 学期、课程与在线刷新（UC-02／12）

```ts
type Term = { id: ID; name: string; ordinal: number; startsAt: Instant;
  endsAt: Instant; isLaunchTerm: boolean; version: number;
  teachingStartsAt: Instant; initialStartsAt: Instant; initialEndsAt: Instant;
  addDropStartsAt: Instant; addDropEndsAt: Instant;
  phase: Phase; closeState: CloseState; closedAt: Instant | null;
  lastCloseError: {code: string; message: string} | null };
type Meeting = { dayOfWeek: 1|2|3|4|5|6|7; startMinute: number;
  endMinute: number; fromDate: string; throughDate: string };
type Offering = { id: ID; termId: ID; courseId: ID; courseName: string;
  department: string; credits: string; prerequisiteCourseIds: ID[];
  meetings: Meeting[]; professor: {id:ID;name:string} | null;
  enrolledCount: number; capacity: 10;
  status: 'OPEN'|'CLOSED'|'CANCELLED'; eligibleToTeach?: boolean };
type Catalog = { termId: ID; revision: string; observedAt: Instant;
  offerings: Offering[] };
type Notice = { id: ID; offeringId: ID; relatedOfferingId: ID | null;
  kind: 'TIME_CONFLICT'|'PREREQUISITE'|'OFFERING_DELETED';
  message: string; resolved: boolean; createdAt: Instant };
```

| 方法／路径 | 权限 | 请求 | `data` 响应 |
| --- | --- | --- | --- |
| GET `/terms` | 已改密的授权用户 | 无 | `{terms:Term[]; currentTermId:ID; previousCompletedTermId:ID\|null; launchTermId:ID}` |
| PUT `/registrar/terms/:termId/windows` | 教务 | `{expectedVersion,teachingStartsAt,initialStartsAt,initialEndsAt,addDropStartsAt,addDropEndsAt}` | `{term:Term}` |
| GET `/catalog?termId=...` | 在读学生、在职教授；教务仅作为补选操作数据 | 无 | `Catalog`，教授含 eligibleToTeach；已被别人选的仍显示但禁选 |
| GET `/student/terms/:termId/notices` | 在读学生本人 | 无 | `{notices:Notice[]}` |

学期名、顺序、正式教学起止、上线学期来自部署 seed 元数据，不新增任意“标记完成”业务接口；`previousCompletedTermId` 为当前时间前 endsAt 已到的最大 ordinal，录分与成绩单统一使用它，无则 null。关闭选课不代表学期已完成。窗口左闭右开；初选与加退选之间可有空档。

前端可见选课页面每 1 秒轮询当前目录、本人课表、通知（请求不叠加，卸载取消）；教授授课／名册、教务关闭状态也每 1 秒刷新受影响数据。目录变更发现服务每 1 秒轮询外部，目标正常条件下发现＋复查＋页面刷新总耗时 ≤5 秒；请求慢、断网或后台标签暂停时显示连接／数据未更新警告，不声称实时。恢复前台立即重读。数据改变时只按新 `version/revision` 替换，编辑脏状态需提示服务器已刷新并保留独立本地编辑副本供对照。可合并请求和查询缓存，但不能把所有轮询降到 5 秒导致双重延迟。NFR-10 须实际计时；提交永远重查，不以轮询成功当许可。

## 3. 学生课表与成绩单（UC-03／07）

```ts
type Choices = { primaryOfferingIds: ID[]; alternateOfferingIds: ID[] };
type Schedule = { studentId: ID; termId: ID; version: number; exists: boolean;
  firstSubmittedAt: Instant | null; saved: Choices; submitted: Choices | null;
  registrations: {offeringId: ID; source: 'SUBMIT'|'LEVELING'|'SUPPLEMENT';
    state: 'ENROLLED'|'COMMITTED'}[] };
type ScheduleWrite = Choices & { expectedVersion: number };
type ReportRow = { courseId: ID; courseName: string; offeringId: ID | null;
  grade: Grade | null; source: 'PROFESSOR'|'IMPORT' };
```

| 方法／路径 | 权限 | 请求 | `data` 响应 |
| --- | --- | --- | --- |
| GET `/student/terms/:termId/schedule` | 在读学生本人 | 无 | `{schedule:Schedule}`；无课表仍返回 exists=false 和持久化版本，初始为 0 |
| PUT `/student/terms/:termId/schedule` | 本人在读、初选／加退选、准入 | `ScheduleWrite` | `{schedule:Schedule}`；只保存、不动注册 |
| POST `/student/terms/:termId/schedule/submit` | 同上 | `ScheduleWrite` | `{schedule:Schedule}`；提交请求内整份选择，不隐式取旧 saved |
| DELETE `/student/terms/:termId/schedule` | 同上 | `{expectedVersion,confirmed:true}` | `{schedule:Schedule}`；exists=false、首次时间清除、版本继续递增 |
| GET `/student/report-card` | 学生本人，含休学毕业 | 无；不接收任意 studentId／termId | `{term:Term\|null; rows:ReportRow[]}`；固定上一完成学期，无则空 |

API 从 session 推导学生 ID，不接受调用者指定他人 ID。`saved` 与注册分开展示：saved 中不在 registrations 的条目标记 selected；已有注册但不在 saved 的显示“仍已注册，正式提交后才退出”。`submitted` 是最后成功提交的选择，包括备选，用于关闭。保存也递增同一 version；提交失败、版本失败不改 saved／submitted／注册。删除保留版本墓碑，防止重建出现 ABA（旧页版本再次匹配）。同一班次不能在选择数组中重复，也不能同时主选和备选；允许同课程不同班次作备选（BR-03）。

## 4. 教授授课、名册与成绩（UC-04／05／06）

```ts
type Teaching = { termId: ID; version: number; offeringIds: ID[] };
type RosterRow = { studentId: ID; studentNumber: string; name: string;
  grade: Grade | null };
type GradeCell = { studentId: ID; grade: string | null }; // ''/null 不修改
type GradeResult = { studentId: ID; outcome: 'SAVED'|'UNCHANGED'|'REJECTED';
  grade: Grade | null; issue: Issue | null };
```

| 方法／路径 | 权限 | 请求 | `data` 响应 |
| --- | --- | --- | --- |
| GET `/professor/terms/:termId/teaching` | 在职教授本人 | 无 | `{teaching:Teaching}` |
| PUT `/professor/terms/:termId/teaching` | 本人、已到授课开始、未关闭 | `{expectedVersion,offeringIds:ID[]}` | `{teaching:Teaching}`；整份替换、失败原安排全保留 |
| GET `/professor/terms/:termId/offerings` | 本人 | 无 | `{offerings:Offering[]}`；只本人已选班次 |
| GET `/professor/offerings/:offeringId/roster` | 本人负责班次 | 无 | `{offering:Offering; students:RosterRow[]}` |
| GET `/professor/grade-context` | 在职教授本人 | 无 | `{term:Term\|null; offerings:Offering[]}`；上一完成且不早于上线学期，否则空 |
| PATCH `/professor/offerings/:offeringId/grades` | 本人、上一完成且不早于上线 | `{cells:GradeCell[]}` | `{results:GradeResult[]}`；200，逐格成功／失败，不因 Z 阻止其他格 |

名册只读有效注册，不含 saved/备选；不暴露 SSN、密码或毕业日期。成绩请求先整请求验证班次归属、学期范围和所有 studentId 均在班次名册，任一越权 ID 则 403、整请求不修改（AC-39）。通过权限后再按格处理非法值，返回 REJECTED；空值保持原值，I 不是空。重复 studentId 属结构错误 400。并发合法修改按数据库串行确认顺序后写覆盖，审计旧值／新值限必要字段；不引入清除或教务改当前成绩接口。

## 5. 人员维护与影响确认（UC-08／09）

```ts
type PersonInput = { name: string; birthDate: string; ssn: string;
  accountEnabled: boolean };
type StudentInput = PersonInput & { status: StudentStatus;
  graduationDate: string | null };
type ProfessorInput = PersonInput & { status: ProfessorStatus; department: string };
type PersonView = { id: ID; account: string; version: number; name: string;
  birthDate: string; ssnMasked: string; accountEnabled: boolean } &
  ({kind:'STUDENT';status:StudentStatus;graduationDate:string|null} |
   {kind:'PROFESSOR';status:ProfessorStatus;department:string});
type Impact = { personVersion:number; impactToken:string;
  expiresAt:Instant; terms:{termId:ID; offeringIds:ID[];
    clearSchedule:boolean; retainedClosedRecords:boolean}[] };
```

下表 `:kind` 只允许 `students`／`professors`，对应 StudentInput／ProfessorInput；不提供 registrar 新增端点。列表 query `q` 按编号／姓名搜索，`page` 从 1、`pageSize` 1—100 默认 20，返回 total。

| 方法／路径 | 请求 | `data` 响应（均限教务） |
| --- | --- | --- |
| GET `/registrar/:kind?q=...&page=...&pageSize=...` | 无 | `{items:PersonView[];total:number;page:number;pageSize:number}` |
| GET `/registrar/:kind/:id` | 无 | `{person:PersonView}`；查询只返回 SSN 掩码 |
| POST `/registrar/:kind` | 对应 Input（accountEnabled 可省略为 true） | 201 `{person:PersonView;initialCredential:{account:string;initialPassword:string}}` |
| POST `/registrar/:kind/:id/impact-preview` | `{expectedVersion,patch:Partial<StudentInput\|ProfessorInput>}` | `{impact:Impact}`；不写业务数据 |
| PATCH `/registrar/:kind/:id` | `{expectedVersion,patch,confirmed?:true,impactToken?:string}` | `{person:PersonView}`；状态在读→休学／毕业、在职→离职必须带确认 token |
| DELETE `/registrar/:kind/:id` | `{expectedVersion,confirmed:true}` | `{deleted:true}`；有历史关联 409 HAS_RECORDS |

SSN 编辑字段省略表示保持原值，不把掩码写回；教务可输入完整新值但响应仍掩码。patch 不允许改编号、角色。预览列出未关闭学期受影响班次，已关闭记录明确保留。impactToken 为服务端签名的人员版本＋patch 摘要＋受影响业务版本／班次集合摘要＋到期时间，5 分钟有效；写事务重新计算摘要与 gate 状态，一旦新增选课／授课或开始关闭即 409 IMPACT_CHANGED，要求重新预览，不接受仅靠 confirmed=true 绕过。普通更新也做版本校验。停用账户只撤销会话，不擅自退课；人员状态变化才按 UC-08／09 清理未关闭学期。人员修改和关联清理同一事务。

## 6. 关闭、计费状态与补选（UC-10／11／13）

```ts
type CloseResult = { termId:ID; closedAt:Instant;
  cancelledOfferings:{offeringId:ID;reason:'NO_PROFESSOR'|'UNDER_MINIMUM'|'CATALOG_DELETED'}[];
  leveled:{studentId:ID;offeringId:ID;alternateIndex:number}[];
  unresolved:{studentId:ID;issues:Issue[]}[];
  billing:{pending:number;acknowledged:number;superseded:number} };
type BillingSummary = {studentId:ID;termId:ID;version:number;businessId:string;
  amountYuan:string;status:'PENDING'|'IN_FLIGHT'|'RETRY'|'ACKNOWLEDGED'|'SUPERSEDED';
  attempts:number;nextAttemptAt:Instant|null;lastErrorCode:string|null};
```

| 方法／路径 | 权限 | 请求 | `data` 响应 |
| --- | --- | --- | --- |
| POST `/registrar/terms/:termId/close` | 教务、未关闭 | `{confirmed:true}` | 202 `{termId:ID;closeState:'CLOSING'}`；gate 已关闭后返回，后台完成 |
| GET `/registrar/terms/:termId/close-result` | 教务 | 无 | `{term:Term;result:CloseResult\|null}`；失败为 OPEN＋lastCloseError，不冒充成功 |
| GET `/registrar/terms/:termId/billing?studentId=...` | 教务 | 可选学生过滤 | `{items:BillingSummary[]}`；只本地送达事实，不称已实际收款 |
| GET `/registrar/terms/:termId/supplement-context?studentId=...` | 教务、已关闭 | 学生 ID | `{student:PersonView;schedule:Schedule;catalog:Catalog}`，仅补选需要的数据，不授予任意成绩／全量名册 |
| POST `/registrar/terms/:termId/supplements` | 教务、已关闭 | `{studentId,offeringId,expectedVersion,confirmed:true}` | `{schedule:Schedule;billing:BillingSummary}` |

重复关闭在 CLOSING 返回 409 CLOSING、CLOSED 返回 409 ALREADY_CLOSED，必须先读结果，不再调剂。补选不放宽其他约束：在读、最多四门、未取消、有教授、容量、先修、冲突、同课程。失败无注册／账单改动；成功同事务新账单版本，已关闭状态不变。重复补选同班次 422 RULE_VIOLATION 或 409 STALE_VERSION，不多收钱。

## 7. xlsx 导入（UC-14）

POST `/registrar/imports/:kind`，教务权限，kind 为 `students`、`professors`、`historical-grades`、`qualifications`。multipart 唯一文件字段 `file`，`.xlsx`；模板首个工作表第一行为字段名，第二行起数据。最多 5 MiB 压缩体、20 MiB 展开体、5000 数据行、50 列；不支持 xls／csv 伪装，不执行宏、公式或外部链接，公式单元格拒绝为该行错误，拒绝恶意压缩包。完全坏文件返回 400；可解析文件逐行处理，200 成功包装。

| kind | 必需表头 | 可选表头／值 |
| --- | --- | --- |
| students | name、birthDate、ssn、status | graduationDate；status 为 ACTIVE／SUSPENDED／GRADUATED |
| professors | name、birthDate、ssn、status、department | status 为 ACTIVE／DEPARTED |
| historical-grades | studentNumber、courseId、termId、grade | grade 六种枚举；只上线前，已有成绩跳过 |
| qualifications | professorNumber、courseId | 无；重复忽略，不撤销 |

日期字符串用 YYYY-MM-DD（可接受 Excel 日期类型按 workbook 日期体系转成本地日历日期）；SSN 和编号必须按文本保留前导零，不经 Number 转换。未定义／重复表头或缺必需表头属于 INVALID_FILE。空数据行忽略，但错误行号使用实际 Excel 行号（表头第 1 行）。人员按全角色 SSN 唯一识别，已存在或文件内此前成功行重复则 SKIPPED；历史按学生＋课程＋学期唯一，资格按教授＋课程唯一。外部 courseId 必须存在于权威目录，目录故障导致依赖目录的导入 503、不猜测有效课程。

```ts
type ImportRow = {row:number;outcome:'IMPORTED'|'SKIPPED'|'REJECTED';
  account?:string;initialPassword?:string; // 仅本次成功新人员，no-store
  issues:Issue[]};
type ImportResult = {kind:string;imported:number;skipped:number;rejected:number;
  rows:ImportRow[]};
// data = ImportResult；不回显完整 ssn、文件内容或密码到审计。
```

每合法行独立事务，人员＋账户一同行原子创建；后行失败不能撤销此前成功行。并发导入由唯一约束裁决，重复转 SKIPPED。不得在未成功落库行返回凭据。断连导致响应未知时重导按唯一键跳过，但不能恢复一次性初始密码；本期不新增密码找回，演示环境重新 seed 仅用于可丢弃测试数据。

## 8. 外部模拟 HTTP 协议（只供服务端）

外部服务独立进程、独立状态文件，不查业务 PostgreSQL。只绑定 loopback／私有网络，`Authorization: Bearer <EXTERNAL_SERVICE_TOKEN>`；控制接口另用 `SIM_CONTROL_TOKEN` 且仅 `SIM_CONTROL_ENABLED=true` 的测试环境启用，不开放到 SPA／公共 portal。

GET 外部 `/catalog/snapshot?termId=...` 返回裸 `{revision:string;termId:ID;courses:{id,name,department,credits,prerequisiteCourseIds:ID[]}[];offerings:{id,courseId,termId,meetings:Meeting[]}[]}`。revision 每变更递增，不包含本地教授／人数；courses 为课程权威集合（含先修引用），offerings 为该学期完整集合，删除用新 revision 集合缺失表达。HTTP 200 空 offerings 才是空目录；非 2xx／超时／解析失败是不可用。客户端超时 8 秒（低于 NFR-02 的 10 秒上限不代表成功读取达标）。

```ts
type BillingMessage = {businessId:string;studentId:ID;studentNumber:string;
  studentName:string;termId:ID;version:number;closedAt:Instant;
  offerings:{offeringId:ID;courseId:ID;courseName:string;credits:string}[];
  totalCredits:string;pricePerCreditYuan:string;amountYuan:string};
type BillingAck = {businessId:string;version:number;
  outcome:'APPLIED'|'DUPLICATE'|'STALE';latestVersion:number};
```

POST 外部 `/billing` 收 BillingMessage，成功 200 BillingAck。稳定 businessId=`termId:studentId:version`（ID 不含冒号），同 ID 不同内容返回 409 INVALID_BILLING_PAYLOAD；同版同内容 DUPLICATE；旧版 STALE；新版 APPLIED 替换学生学期账单，非追加金额。确认必须匹配 businessId／version，不能把任意 2xx 视为成功，STALE 需 latestVersion≥本版才能确认旧版无需再发。超时 5 秒，失败 60 秒后重试；没有成绩／SSN／密码字段。

测试控制：PUT `/control/faults` 接收 `{catalog:{mode:'normal'|'unavailable'|'timeout',delayMs:number},billing:{mode:'normal'|'unavailable'|'timeout'|'drop-after-accept',delayMs:number}}`；PUT `/control/catalog` 接收完整 snapshot 的 courses／offerings 与 termId，模拟服务自动生成 revision；GET `/control/bills?termId=...&studentId=...` 返回 latestVersion、latestAmountYuan、acceptedBusinessIds。drop-after-accept 必须先持久化再断开连接；重启仍保留账单版本和去重事实。控制接口返回 `{ok:true}` 或查询数据，不挂在业务 `/api` 下。

## 9. 契约验收与变更

US-026 文档验收：UC-01—14 都有可编码请求／响应、字段权威、权限与失败语义；与 v0.6 的 BR-01—17、AC-01—64 对照；前后端和模拟 worker 使用同一 DTO。本文自身未运行任何接口测试。实现前若发现必要变更，统筹更新本文及 contracts 并通知消费者，禁止私自更名或将错误包装改成另一套。测试计划由独立 worker 提供（计划路径 `docs/TEST_PLAN.md` 与 `docs/testing/acceptance-cases.md`，本任务不拥有）。
