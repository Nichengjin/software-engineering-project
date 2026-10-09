import { useCallback, useState } from "react";
import type { BillingSummary, CloseResult, Term } from "@wylie/contracts";
import { api, idPath, write } from "../lib/api";
import { useTerms } from "../lib/terms";
import { useAction, useResource } from "../lib/hooks";
import { dateTime, label } from "../lib/format";
import {
  ActionFeedback,
  Confirm,
  Empty,
  ErrorBox,
  Freshness,
  Loading,
  Panel,
} from "../components/common";
import { Supplement } from "./supplement";

export function ClosePage() {
  const { data } = useTerms();
  const [chosen, setChosen] = useState("");
  const term = data?.terms.find((t) => t.id === (chosen || data.currentTermId));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">教务 / 选课结算</span>
          <h1>关闭选课与计费</h1>
          <p>
            点击关闭后，系统在后台完成调剂和班次取消；处理完成后，下方显示最终结果和账单发送情况。
          </p>
        </div>
      </div>
      <Panel title="选择结算学期">
        <label className="inline-field">
          学期
          <select
            value={chosen || data?.currentTermId || ""}
            onChange={(e) => setChosen(e.target.value)}
          >
            {data?.terms.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name} · {label(t.closeState)}
              </option>
            ))}
          </select>
        </label>
      </Panel>
      {term ? (
        <CloseDashboard key={term.id} termId={term.id} />
      ) : (
        <Empty>暂无可查询学期。</Empty>
      )}
    </>
  );
}
function CloseDashboard({ termId }: { termId: string }) {
  const base = `/registrar/terms/${idPath(termId)}`;
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [close, billing] = await Promise.all([
        api<{ term: Term; result: CloseResult | null }>(
          `${base}/close-result`,
          { signal },
        ),
        api<{ items: BillingSummary[] }>(`${base}/billing`, { signal }),
      ]);
      return { ...close, bills: billing.items };
    },
    [base],
  );
  const resource = useResource(load, 1000);
  const action = useAction();
  const [confirm, setConfirm] = useState(false);
  const [filter, setFilter] = useState("");
  const data = resource.data;
  // 关闭结果只记录学生内部标识，用账单里的学号和姓名显示。
  const who = (studentId: string) => {
    const bill = data?.bills.find((b) => b.studentId === studentId);
    return bill ? `${bill.studentNumber} ${bill.studentName}` : studentId;
  };
  return (
    <>
      <ErrorBox error={resource.error && new Error(resource.error)} />
      <ActionFeedback
        action={{
          error: action.error,
          success: data?.term.closeState === "CLOSING" ? action.success : "",
        }}
      />
      {resource.loading && <Loading />}
      {data && (
        <>
          <Panel
            title={`${data.term.name} · ${label(data.term.closeState)}`}
            extra={
              <Freshness
                updatedAt={resource.updatedAt}
                error={resource.error}
              />
            }
          >
            {data.term.closeState === "OPEN" && (
              <div className="panel-footer">
                <div>
                  <p>
                    关闭后停止学生选课与教授授课变更，执行一次调剂及取消并生成计费账单。
                  </p>
                  {data.term.lastCloseError && (
                    <div className="alert error" role="alert">
                      上次关闭失败：{data.term.lastCloseError.message}（
                      {data.term.lastCloseError.code}）。系统未冒充关闭成功。
                    </div>
                  )}
                </div>
                <button
                  className="danger"
                  disabled={action.busy || !!resource.error}
                  onClick={() => setConfirm(true)}
                >
                  关闭选课
                </button>
              </div>
            )}
            {data.term.closeState === "CLOSING" && (
              <div className="alert warning" role="status">
                已停止接收新的选课变更，正在等待在途操作、调剂与生成账单。请等待结果，不要重复关闭。
              </div>
            )}
            {data.term.closeState === "CLOSED" && (
              <div className="alert success">
                关闭完成：{dateTime(data.term.closedAt)}
                。账单暂时发送失败时，关闭结果不会撤销，系统会自动重发。
              </div>
            )}
          </Panel>
          {data.result && (
            <CloseResultPanel result={data.result} who={who} />
          )}
          <Panel
            title="计费送达状态"
            extra={
              <span className="muted">{data.bills.length} 个账单版本</span>
            }
          >
            <label className="inline-field">
              按学号或姓名筛选
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="学号或姓名"
              />
            </label>
            {data.bills.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>学号</th>
                      <th>姓名</th>
                      <th>账单版本</th>
                      <th>金额（元）</th>
                      <th>送达状态</th>
                      <th>尝试次数</th>
                      <th>下次重试／错误</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bills
                      .filter((b) =>
                        `${b.studentNumber} ${b.studentName}`
                          .toLocaleLowerCase()
                          .includes(filter.trim().toLocaleLowerCase()),
                      )
                      .map((b) => (
                        <tr key={b.businessId}>
                          <td>{b.studentNumber}</td>
                          <td>{b.studentName}</td>
                          <td title={`业务编号 ${b.businessId}`}>
                            v{b.version}
                          </td>
                          <td>{b.amountYuan}</td>
                          <td>
                            <span
                              className={`badge ${b.status === "ACKNOWLEDGED" ? "blue" : "amber"}`}
                            >
                              {label(b.status)}
                            </span>
                          </td>
                          <td>{b.attempts}</td>
                          <td>
                            {dateTime(b.nextAttemptAt)}
                            <small>{b.lastErrorCode ?? "—"}</small>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>尚未生成账单。</Empty>
            )}
            <p className="hint">
              发送失败的账单每 60 秒自动重发；收款由计费系统处理。补选后会生成新版完整账单替代旧版，金额不累加。
            </p>
          </Panel>
          {data.term.closeState === "CLOSED" && (
            <Supplement termId={termId} onSaved={resource.refresh} />
          )}
        </>
      )}
      {confirm && (
        <Confirm
          title="确认关闭选课并结算？"
          busy={action.busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            void action.run(async () => {
              try {
                await write(`${base}/close`, "POST", { confirmed: true });
                setConfirm(false);
              } finally {
                resource.refresh();
              }
            }, "已开始关闭选课，处理完成后会在下方显示结果。")
          }
        >
          关闭后学生和教授不能再修改选课与授课。系统会等正在进行的提交完成，再执行备选调剂，取消不足三人或没有教授的班次，并生成账单。学期关闭后不能重新开放。
          <ActionFeedback action={action} />
        </Confirm>
      )}
    </>
  );
}
function CloseResultPanel({
  result,
  who,
}: {
  result: CloseResult;
  who: (studentId: string) => string;
}) {
  return (
    <Panel title="最终关闭结果">
      <div className="stats">
        <div>
          <strong>{result.cancelledOfferings.length}</strong>
          <span>取消班次</span>
        </div>
        <div>
          <strong>{result.leveled.length}</strong>
          <span>备选调剂</span>
        </div>
        <div>
          <strong>{result.unresolved.length}</strong>
          <span>待处理学生</span>
        </div>
        <div>
          <strong>{result.billing.acknowledged}</strong>
          <span>已确认送达</span>
        </div>
      </div>
      <h3>取消班次</h3>
      {result.cancelledOfferings.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>班次</th>
                <th>原因</th>
              </tr>
            </thead>
            <tbody>
              {result.cancelledOfferings.map((o) => (
                <tr key={o.offeringId}>
                  <td>{o.offeringId}</td>
                  <td>{label(o.reason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>没有取消班次。</Empty>
      )}
      <h3>备选调剂</h3>
      {result.leveled.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>学生</th>
                <th>调入班次</th>
                <th>备选优先级</th>
              </tr>
            </thead>
            <tbody>
              {result.leveled.map((r, i) => (
                <tr key={i}>
                  <td>{who(r.studentId)}</td>
                  <td>{r.offeringId}</td>
                  <td>第 {r.alternateIndex + 1} 志愿</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>没有备选调剂。</Empty>
      )}
      <h3>未解决问题</h3>
      {result.unresolved.length ? (
        <ul className="simple-list">
          {result.unresolved.map((row) => (
            <li key={row.studentId}>
              <strong>{who(row.studentId)}</strong>
              <small>{row.issues.map((i) => i.message).join("；")}</small>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>没有待处理问题。</Empty>
      )}
    </Panel>
  );
}
