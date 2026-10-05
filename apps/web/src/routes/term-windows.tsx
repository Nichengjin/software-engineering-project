import { useMemo, useState } from "react";
import type { Term } from "@wylie/contracts";
import { useTerms } from "../lib/terms";
import { useAction, useVersionedDraft } from "../lib/hooks";
import { idPath, write } from "../lib/api";
import { localTime, utcTime, dateTime, label } from "../lib/format";
import { ActionFeedback, Confirm, Empty, Panel } from "../components/common";

const fields = {
  teachingStartsAt: "授课选择开始",
  initialStartsAt: "初选开始",
  initialEndsAt: "初选结束",
  addDropStartsAt: "加退选开始",
  addDropEndsAt: "加退选结束",
} as const;
type Windows = Record<keyof typeof fields, string>;
export function TermWindowsPage() {
  const { data } = useTerms();
  const [chosen, setChosen] = useState("");
  const term = data?.terms.find((t) => t.id === (chosen || data.currentTermId));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">教务 / 学期配置</span>
          <h1>学期窗口</h1>
          <p>
            时间统一按北京时间（Asia/Shanghai）显示和输入，起点包含、终点不包含。
          </p>
        </div>
      </div>
      <Panel title="选择学期">
        <label className="inline-field">
          学期
          <select
            value={chosen || data?.currentTermId || ""}
            onChange={(e) => setChosen(e.target.value)}
          >
            {data?.terms.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name} · {label(t.phase)}
              </option>
            ))}
          </select>
        </label>
      </Panel>
      {term ? (
        <WindowsEditor key={term.id} term={term} />
      ) : (
        <Empty>暂无学期。</Empty>
      )}
    </>
  );
}
function WindowsEditor({ term }: { term: Term }) {
  const { refresh } = useTerms();
  const server = useMemo(
    () => ({
      version: term.version,
      value: Object.fromEntries(
        Object.keys(fields).map((key) => [
          key,
          localTime(term[key as keyof Windows]),
        ]),
      ) as Windows,
    }),
    [term],
  );
  const edit = useVersionedDraft(server);
  const action = useAction();
  const [confirm, setConfirm] = useState<"save" | "adopt" | null>(null);
  const blocked = action.busy || term.closeState !== "OPEN" || edit.stale;
  return (
    <Panel
      title={`${term.name} · ${label(term.phase)}`}
      extra={<span className="badge">v{term.version}</span>}
    >
      <p className="hint">
        正式学期：{dateTime(term.startsAt)} 至 {dateTime(term.endsAt)}；
        {term.isLaunchTerm ? "上线学期" : "非上线学期"}
        。正式教学起止与顺序由部署元数据维护。
      </p>
      {edit.stale && (
        <div className="alert warning">
          服务器窗口已变更，本地编辑保留；请先核对最新窗口。
          <ul>
            {Object.entries(fields).map(([key, title]) => (
              <li key={key}>
                {title}：{server.value[key as keyof Windows].replace("T", " ")}
              </li>
            ))}
          </ul>
          <button onClick={() => setConfirm("adopt")}>采用服务器窗口</button>
        </div>
      )}
      {term.closeState !== "OPEN" && (
        <div className="alert warning">
          选课{label(term.closeState)}，不能修改窗口。
        </div>
      )}
      {edit.draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setConfirm("save");
          }}
        >
          <fieldset disabled={blocked}>
            <div className="form-grid">
              {Object.entries(fields).map(([key, title]) => (
                <label key={key}>
                  {title}（北京时间）
                  <input
                    required
                    type="datetime-local"
                    value={edit.draft!.value[key as keyof Windows]}
                    onChange={(e) =>
                      edit.change({
                        ...edit.draft!.value,
                        [key]: e.target.value,
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <ActionFeedback action={action} />
          <div className="panel-footer">
            <p className="hint">
              授课开始 ≤ 初选开始 &lt; 初选结束 ≤ 加退选开始 &lt;
              加退选结束，可保留初选与加退选之间的空档。
            </p>
            <button className="primary" disabled={blocked || !edit.draft.dirty}>
              保存窗口
            </button>
          </div>
        </form>
      )}
      {confirm && (
        <Confirm
          title={
            confirm === "adopt" ? "放弃本地窗口编辑？" : "确认修改学期窗口？"
          }
          busy={action.busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === "adopt") {
              edit.adopt();
              setConfirm(null);
            } else
              void action.run(async () => {
                if (!edit.draft || blocked)
                  throw new Error("请先刷新学期窗口。");
                try {
                  const result = await write<{ term: Term }>(
                    `/registrar/terms/${idPath(term.id)}/windows`,
                    "PUT",
                    {
                      expectedVersion: edit.draft.version,
                      ...Object.fromEntries(
                        Object.entries(edit.draft.value).map(([key, value]) => [
                          key,
                          utcTime(value),
                        ]),
                      ),
                    },
                  );
                  edit.accept(
                    result.term.version,
                    Object.fromEntries(
                      Object.keys(fields).map((key) => [
                        key,
                        localTime(result.term[key as keyof Windows]),
                      ]),
                    ) as Windows,
                  );
                  setConfirm(null);
                } finally {
                  refresh();
                }
              }, "学期窗口已保存。");
          }}
        >
          修改窗口会立即影响业务准入，服务器按实际确认时刻判断是否在窗口内。
          <ActionFeedback action={action} />
        </Confirm>
      )}
    </Panel>
  );
}
