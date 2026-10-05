# 课程目录与计费模拟服务

关联 US-005、US-016（AC-34—36）、US-022（AC-57）；实现边界见 [外部 HTTP 契约第 8 节](design-docs/api-contract.md#8-外部模拟-http-协议只供服务端)。这是独立 Node/Hono 进程，默认端口 **3001**，不连接主业务 PostgreSQL，不模拟实际扣款或邮寄账单。总体设计草稿中的 4001 应由统筹同步为 3001。

## 1. 启动及私有边界

从仓库根目录构建；运行环境为 Node.js 22 LTS、npm workspaces：

```sh
npm ci
npm run build -w @wylie/contracts -w @wylie/simulators
node --env-file-if-exists=.env apps/simulators/dist/index.js
```

在 orb 里运行长期服务时使用监督服务，**不要加 `--portal`**：

```sh
amp orb service start simulators --command 'node --env-file-if-exists=.env apps/simulators/dist/index.js'
amp orb service logs simulators
amp orb service stop simulators
```

仅绑定 `127.0.0.1`；浏览器和 SPA 不调用它，Vite／业务 API 不代理 `/control/*`。不得为该端口建立公共 portal。服务之间的请求及下文 curl 在服务器／orb 的私有终端执行，不是给浏览器访问的地址。不同容器部署须改为受网络策略保护的私有监听，不能直接开放公网。

| 变量 | 默认值／要求 |
| --- | --- |
| `SIM_PORT` | `3001`；监听端口 1—65535 |
| `SIM_SEED_PATH` | 仓库根目录下 `packages/db/seed/catalog.json`，必须存在且有效 |
| `SIM_STATE_PATH` | 仓库根目录下 `tmp/simulators-state.json`；`tmp/` 已 gitignored |
| `EXTERNAL_SERVICE_TOKEN` | 必须提供非空值；主业务客户端使用它访问目录和计费 |
| `SIM_CONTROL_ENABLED` | 仅值为 `true` 时启用测试控制；默认关闭，控制请求返回 404 |
| `SIM_CONTROL_TOKEN` | 控制启用时必需，非空且必须不同于外部 token |

环境变量中的相对文件路径和未配置的默认路径都按仓库根目录解析；绝对路径原样使用。因此 workspace 启动和构建产物启动不会换一份状态文件。凭据由私密环境／gitignored `.env` 注入，不在仓库、控制脚本或日志里写固定值。

`createSimulatorApp(options)` 只初始化状态和构造路由；`startSimulatorServer(options, port)` 另行监听，等待 bind 成功后返回。测试可以选择随机私有端口；导入工厂不会自动启动服务。服务仅支持一个进程写同一状态路径；不要用多 worker 或给多个实例配置同一个文件。

## 2. Seed 是初始化来源，不是每次启动的覆盖数据

底座 seed 使用同一 `packages/db/seed/catalog.json` 对齐外部课程、班次与学期 ID；模拟器不会生成未知课程或猜测父进程的 UUID。文件结构为：

```json
{
  "catalogs": [
    {
      "revision": "1",
      "termId": "explicit-term-id",
      "courses": [
        {
          "id": "explicit-course-id",
          "name": "虚构课程",
          "department": "虚构院系",
          "credits": "3.00",
          "prerequisiteCourseIds": []
        }
      ],
      "offerings": [
        {
          "id": "explicit-offering-id",
          "courseId": "explicit-course-id",
          "termId": "explicit-term-id",
          "meetings": [
            {
              "dayOfWeek": 1,
              "startMinute": 540,
              "endMinute": 600,
              "fromDate": "2026-09-01",
              "throughDate": "2026-12-31"
            }
          ]
        }
      ]
    }
  ]
}
```

上例只说明格式，不替代底座真实 seed。至少显式定义一个学期；该学期可以有空 courses／offerings。学期及班次 ID 唯一，班次引用已存在课程，所有先修引用在课程权威集合内。日期必须是真实日历日期；星期 1—7、分钟 0—1440、开始严格早于结束，日期范围不可反转。学分为正十进制字符串。

首次启动仅在状态文件不存在时从 seed 初始化；重启仍检查 seed，但已有状态中的目录修改、版本及计费事实优先。seed 缺失、格式错误或状态损坏时退出并给出脱敏配置检查提示，**不自动重建／清空账单**。未知学期返回 404，不伪造空目录。只有已知学期的 HTTP 200 空 offerings 才代表空目录。

## 3. 计费版本和持久化

`POST /billing` 使用契约的 `BillingMessage`，`businessId=termId:studentId:version`；ID 不含冒号，version 为正安全整数。所有对象拒绝未知字段，含成绩、SSN、密码的输入不会被落盘。身份及课程名不能为空，最多四门、课程与班次不重复；币值和学分拒绝负数、指数和超过两位的小数。先精确汇总逐项学分，再乘单价，**总额只按分四舍五入一次（非负数 half-up）**，不逐门舍入后求和，不使用二进制浮点。无课程的账单合计及金额必须为零。

例如 3.50 学分 × 125.55 元 = 439.425 元，金额必须为 `439.43`，`439.42` 被拒绝。实现将学分与单价转为百分之一整数，总金额分数为 `(学分整数 × 单价整数 + 50) / 100` 的整数商；输入小数精度和其他校验不变。

计费使用请求内冻结的课程快照，不重新查当前目录，不依赖本地业务数据库；目录后来删除班次不会让旧合法账单重试失败。

| 接收情况 | HTTP／结果 | 账单效果 |
| --- | --- | --- |
| 首次合法学生学期版本或更高版本 | 200 `APPLIED` | 最新账单完整替换，不累加金额 |
| 同 businessId、同内容 | 200 `DUPLICATE` | 不重复写入或计费；JSON 对象字段顺序不影响内容比较 |
| 同 businessId、不同合法内容 | 409 `INVALID_BILLING_PAYLOAD` | 保留原事实，包括学生姓名或课程快照不同 |
| 首次到达的旧版本 | 200 `STALE` | 保留最高版本，记录本 ID 的内容以便后续去重 |
| 结构或金额不一致 | 400 `INVALID_BILLING_PAYLOAD` | 不接受任何计费事实 |
| 故障或持久化失败 | 503 | 不发成功确认；不声称尚未可靠写盘的资料已接收 |

同一学生同一学期的 1500 元版本 2 先到、1200 元版本 1 后到时，最终仍是 1500 元，不是 1200 或 2700。`latestVersion` 在所有成功确认中返回该学生学期的最高版本；收到旧版确认不能当成最新版送达。

独立状态文件保存完整合法账单消息、去重 ID 和目录；账单最新版本由持久化事实恢复。所有修改在一个进程内排队：同目录临时文件（0600）→ 写入 → 文件 fsync → 原子 rename → 父目录 fsync → 更新内存并确认。写入失败后拒绝进一步状态读写，避免磁盘与内存不确定时继续假确认；修复存储问题后重启读取持久化文件。硬杀进程不会撤销已确认账单。异常中断可能留下不被读取的临时文件，不拿它代替最终状态文件。

模拟器不会定时重发或生成新版本；主业务 outbox 负责 60 秒重试。本文件只保证重复或迟到交付安全。保留状态文件才能保留跨重启去重事实；换文件等于另一个测试系统，不是恢复。不要为了故障恢复删除状态文件或清除非可丢弃演示数据。

日志仅记录请求 ID、路由模板、对象业务 ID、处理结果、状态码和耗时；断连状态码为 0，不伪报 HTTP 200。没有请求体、认证头、token、成绩或 SSN。状态文件含学生必要身份和最终课程副本，应作为私有文件管理，不上传到 portal 或仓库。

## 4. 私有测试控制与复现

先在服务器终端载入私密环境变量；不要开启 shell `set -x`、curl `-v` 或把凭据输出到终端。以下命令假设 token 已在环境中，`SIM_BASE_URL` 指向私有模拟器：

```sh
SIM_BASE_URL=http://127.0.0.1:3001
TERM_ID=$(jq -r '.catalogs[0].termId' packages/db/seed/catalog.json)
curl --fail-with-body -sS -H "Authorization: Bearer $EXTERNAL_SERVICE_TOKEN" \
  "$SIM_BASE_URL/catalog/snapshot?termId=$TERM_ID"
```

### 4.1 修改时间、先修及删除班次

`PUT /control/catalog` 接收 `{termId,courses,offerings}` 完整替换，不接收客户端 revision，不接受本地教授或人数。返回 `{ok:true}` 后重新 GET 可读到自动递增的 revision；从集合中移除班次就是删除。无效引用／日期／时段返回 400，旧快照和 revision 不变。

```sh
mkdir -p tmp
curl --fail-with-body -sS -H "Authorization: Bearer $EXTERNAL_SERVICE_TOKEN" \
  "$SIM_BASE_URL/catalog/snapshot?termId=$TERM_ID" | jq 'del(.revision)' > tmp/catalog-update.json
# 编辑 tmp/catalog-update.json 中的 meetings 或 prerequisiteCourseIds；
# 删除某班次时从 offerings 数组移除，不能只发改动字段。
curl --fail-with-body -sS -X PUT -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $SIM_CONTROL_TOKEN" \
  --data-binary @tmp/catalog-update.json "$SIM_BASE_URL/control/catalog"
```

用 `courses:[]` 和 `offerings:[]` 发布已知学期的明确空目录，然后切目录 unavailable；前者 GET 200 空数组，后者 GET 503，用于验证业务客户端不能把外部失败当成课程删除。

### 4.2 不可用、超时、已接收但响应丢失

`PUT /control/faults` 必须同时提供 catalog 和 billing；每项 delayMs 为 0—120000 的整数。每个请求在开始处理时复制故障模式，恢复控制不改变已经开始的请求。故障开关仅在内存，重启默认恢复 normal；目录修改、账单和去重事实仍持久保存。

```sh
curl --fail-with-body -sS -X PUT -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $SIM_CONTROL_TOKEN" \
  --data '{"catalog":{"mode":"normal","delayMs":0},"billing":{"mode":"drop-after-accept","delayMs":0}}' \
  "$SIM_BASE_URL/control/faults"
```

- `normal`：延迟 delayMs 后正常处理。
- `unavailable`：延迟后返回 503；计费不接受该消息。
- `timeout`：目录至少等待 8100 ms、计费至少等待 5100 ms，即使 delayMs=0 也触发契约的 8 秒／5 秒客户端截止；等待结束后继续处理。客户端断连不证明未接受，重试必须沿用 businessId。
- `drop-after-accept`（只限计费）：先完成可靠持久化，再通过 Node HTTP response destroy 断开真实连接；curl／fetch 得到连接失败，不能得到伪成功 JSON。重复请求仍按内容去重。

响应丢失复现：启用上述模式→向 `/billing` 发合法版本 1→确认请求连接失败→查询控制账单确认已接收→停止并重启服务（不删文件）→同 businessId 原样重发，期望 `DUPLICATE`。新版先到复现：正常模式发 1500 元版 2→发 1200 元版 1，期望 `STALE/latestVersion=2`，查询金额仍为 1500。无需手写 UUID，使用主业务发送的 payload 或测试提供的显式虚构身份。

恢复正常模式：

```sh
curl --fail-with-body -sS -X PUT -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $SIM_CONTROL_TOKEN" \
  --data '{"catalog":{"mode":"normal","delayMs":0},"billing":{"mode":"normal","delayMs":0}}' \
  "$SIM_BASE_URL/control/faults"
```

### 4.3 查询测试账单

```sh
# STUDENT_ID 从底座测试身份或已发送的合法 billing payload 获取。
curl --fail-with-body -sS -H "Authorization: Bearer $SIM_CONTROL_TOKEN" \
  "$SIM_BASE_URL/control/bills?termId=$TERM_ID&studentId=$STUDENT_ID"
```

返回裸 `{latestVersion,latestAmountYuan,acceptedBusinessIds}`，没有账单时为版本 0、金额 `0.00`、空 ID 数组。acceptedBusinessIds 含已持久化接收的旧版本 ID，但每个只出现一次；不表示这些金额相加，也不表示实际收款。查询不回传完整人员资料或账单内容。

## 5. 自动化验证

```sh
npm run build -w @wylie/contracts
npm run typecheck -w @wylie/simulators
npm run build -w @wylie/simulators
npm test -- apps/simulators/test/http.test.ts
```

测试使用随机 loopback 端口、运行时生成的独立 token、临时 seed 和独立临时状态文件，全部请求经真实 HTTP socket。覆盖并发同 ID、不同内容拒绝、新版替换／旧版迟到、精确小数学分与零元、日期与引用校验、目录空与故障区分、未授权及禁用控制、故障恢复、存储失败、敏感日志检查。响应丢失用例另起 Node 子进程，确认失败请求后立即检查磁盘事实，再 SIGKILL、重新启动并重发；不是只调用纯函数或保留同一内存对象。

目录／计费截止测试真实等待约 8 秒，整套约 10 秒。测试不替代主业务数据库容量竞争、关闭原子性、60 秒重试、目录变化 5 秒可见或课程要求的 500／2000 并发性能验收。
