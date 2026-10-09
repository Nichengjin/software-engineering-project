import { useCallback, useMemo, useState } from "react";
import type {
  Catalog,
  Offering,
  Teaching,
  Term,
  RosterRow,
  GradeResult,
} from "@wylie/contracts";
import { api, idPath, write } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCurrentTerm } from "../lib/terms";
import { useAction, useResource, useVersionedDraft } from "../lib/hooks";
import { label } from "../lib/format";
import { OfferingTable } from "../components/catalog";
import {
  ActionFeedback,
  Confirm,
  Empty,
  ErrorBox,
  Freshness,
  Loading,
  Panel,
} from "../components/common";

export function ProfessorTeaching() {
  const term = useCurrentTerm();
  return term ? (
    <TeachingEditor key={term.id} term={term} />
  ) : (
    <Empty>尚未取得当前学期。</Empty>
  );
}
function TeachingEditor({ term }: { term: Term }) {
  const { auth } = useAuth();
  const base = `/professor/terms/${idPath(term.id)}`;
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [catalog, { teaching }] = await Promise.all([
        api<Catalog>(`/catalog?termId=${idPath(term.id)}`, { signal }),
        api<{ teaching: Teaching }>(`${base}/teaching`, { signal }),
      ]);
      return { catalog, teaching };
    },
    [term.id, base],
  );
  const resource = useResource(load, 1000);
  const server = useMemo(
    () =>
      resource.data
        ? {
            version: resource.data.teaching.version,
            value: resource.data.teaching.offeringIds,
          }
        : undefined,
    [resource.data],
  );
  const edit = useVersionedDraft(server);
  const action = useAction();
  const [confirm, setConfirm] = useState<"save" | "adopt" | null>(null);
  const blocked =
    term.closeState !== "OPEN" ||
    term.phase === "BEFORE_TEACHING" ||
    edit.stale ||
    action.busy ||
    !!resource.error;
  const title = (id: string) =>
    resource.data?.catalog.offerings.find((o) => o.id === id)?.courseName ?? id;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">教授 / 教学安排</span>
          <h1>选择授课班次</h1>
          <p>
            仅可选择具有授课资格、未被其他教授占用的班次。保存时校验整份安排。
          </p>
        </div>
        <Freshness updatedAt={resource.updatedAt} error={resource.error} />
      </div>
      <ErrorBox error={resource.error && new Error(resource.error)} />
      <ActionFeedback action={action} />
      {resource.loading && <Loading />}
      {edit.stale && (
        <div className="alert warning" role="alert">
          授课安排已在服务器变更。本地 v{edit.draft?.version}，服务器 v
          {server?.version}；本地编辑仍保留。
          <p>服务器安排：{server?.value.map(title).join("、") || "无"}</p>
          <button onClick={() => setConfirm("adopt")}>采用服务器安排</button>
        </div>
      )}
      {(term.closeState !== "OPEN" || term.phase === "BEFORE_TEACHING") && (
        <div className="alert warning">
          当前阶段不能修改授课安排：{label(term.phase)}。
        </div>
      )}
      {resource.data && edit.draft && (
        <div className="selection-layout">
          <Panel title="可授课目录">
            <OfferingTable
              offerings={resource.data.catalog.offerings}
              actions={(o) => {
                const selected = edit.draft!.value.includes(o.id);
                const taken =
                  !!o.professor && o.professor.id !== auth?.user.personId;
                return (
                  <>
                    <small>
                      {taken
                        ? "其他教授已选"
                        : o.eligibleToTeach
                          ? "有授课资格"
                          : "无授课资格"}
                    </small>
                    <button
                      disabled={
                        blocked ||
                        (!selected &&
                          (!o.eligibleToTeach || taken || o.status !== "OPEN"))
                      }
                      onClick={() =>
                        edit.change(
                          selected
                            ? edit.draft!.value.filter((id) => id !== o.id)
                            : [...edit.draft!.value, o.id],
                        )
                      }
                    >
                      {selected ? "取消选择" : "选择授课"}
                    </button>
                  </>
                );
              }}
            />
          </Panel>
          <aside>
            <Panel
              title="本地授课安排"
              extra={
                <span className="badge">
                  {edit.draft.dirty ? "未保存" : "已同步"}
                </span>
              }
            >
              {edit.draft.value.length ? (
                <ul className="simple-list">
                  {edit.draft.value.map((id) => (
                    <li key={id}>
                      <strong>{title(id)}</strong>
                      <small>{id}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>尚未选择授课班次。</Empty>
              )}
              <button
                className="primary full"
                disabled={blocked || !edit.draft.dirty}
                onClick={() => setConfirm("save")}
              >
                保存授课安排
              </button>
              <p className="hint">
                取消已保存班次会释放该班次的授课归属。名册只允许本人查询。
              </p>
            </Panel>
          </aside>
        </div>
      )}
      {confirm && (
        <Confirm
          title={
            confirm === "adopt"
              ? "放弃本地编辑，采用服务器安排？"
              : "确认替换全部授课安排？"
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
                  throw new Error("当前安排不能提交，请先刷新核对。");
                try {
                  const { teaching } = await write<{ teaching: Teaching }>(
                    `${base}/teaching`,
                    "PUT",
                    {
                      expectedVersion: edit.draft.version,
                      offeringIds: edit.draft.value,
                    },
                  );
                  edit.accept(teaching.version, teaching.offeringIds);
                  setConfirm(null);
                } finally {
                  resource.refresh();
                }
              }, "授课安排已保存。");
          }}
        >
          本次操作不会自动重试；发生版本冲突时需重新核对。
          <ActionFeedback action={action} />
        </Confirm>
      )}
    </>
  );
}

export function ProfessorRoster({ grades = false }: { grades?: boolean }) {
  const term = useCurrentTerm();
  const load = useCallback(
    (signal: AbortSignal) =>
      grades
        ? api<{ term: Term | null; offerings: Offering[] }>(
            "/professor/grade-context",
            { signal },
          )
        : term
          ? api<{ offerings: Offering[] }>(
              `/professor/terms/${idPath(term.id)}/offerings`,
              { signal },
            ).then((data) => ({ ...data, term }))
          : Promise.resolve({ term: null, offerings: [] as Offering[] }),
    [grades, term?.id],
  );
  const resource = useResource(load, 1000);
  const [selected, setSelected] = useState("");
  const offering = resource.data?.offerings.find((o) => o.id === selected);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            教授 / {grades ? "成绩管理" : "班次名册"}
          </span>
          <h1>{grades ? "录入上一完成学期成绩" : "查看我的学生名册"}</h1>
          <p>
            {grades
              ? "空白保持原成绩；A、B、C、D、F、I 为合法值。每格处理结果单独列出。"
              : "名册只包含有效注册学生，不包含保存选择或备选。"}
          </p>
        </div>
        <Freshness updatedAt={resource.updatedAt} error={resource.error} />
      </div>
      <ErrorBox error={resource.error && new Error(resource.error)} />
      {resource.loading && <Loading />}
      <Panel
        title={
          resource.data?.term?.name ??
          (grades ? "暂无可录分的已完成学期" : "当前学期")
        }
      >
        {resource.data?.offerings.length ? (
          <label className="inline-field">
            本人负责班次
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">请选择班次</option>
              {resource.data.offerings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.courseName} · {o.id}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <Empty>
            {grades
              ? "没有符合上一完成学期及上线学期范围的本人班次。"
              : "尚无本人授课班次。"}
          </Empty>
        )}
      </Panel>
      {offering && (
        <Roster
          key={`${offering.id}-${grades}`}
          offering={offering}
          grades={grades}
        />
      )}
    </>
  );
}
function Roster({ offering, grades }: { offering: Offering; grades: boolean }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      api<{ offering: Offering; students: RosterRow[] }>(
        `/professor/offerings/${idPath(offering.id)}/roster`,
        { signal },
      ),
    [offering.id],
  );
  const resource = useResource(load, 1000);
  const [cells, setCells] = useState<Record<string, string>>({});
  const [results, setResults] = useState<GradeResult[]>([]);
  const action = useAction();
  const [confirm, setConfirm] = useState(false);
  const removed = Object.keys(cells).filter(
    (id) => !resource.data?.students.some((s) => s.studentId === id),
  );
  return (
    <Panel
      title={`${offering.courseName} · ${offering.id}`}
      extra={
        <Freshness updatedAt={resource.updatedAt} error={resource.error} />
      }
    >
      <ErrorBox error={resource.error && new Error(resource.error)} />
      <ActionFeedback action={action} />
      {resource.loading && <Loading />}
      {removed.length > 0 && (
        <div className="alert warning">
          部分本地录分的学生已不在最新名册，请刷新页面重新录入；未自动丢弃本地数据。
        </div>
      )}
      {resource.data?.students.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>学号</th>
                <th>姓名</th>
                <th>当前成绩</th>
                {grades && (
                  <>
                    <th>本次录入（空白不改）</th>
                    <th>逐格结果</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {resource.data.students.map((s) => {
                const result = results.find((r) => r.studentId === s.studentId);
                return (
                  <tr key={s.studentId}>
                    <td>{s.studentNumber}</td>
                    <td>{s.name}</td>
                    <td>{s.grade ?? "未录入"}</td>
                    {grades && (
                      <>
                        <td>
                          <input
                            className="grade-input"
                            aria-label={`${s.studentNumber} ${s.name} 成绩`}
                            value={cells[s.studentId] ?? ""}
                            disabled={action.busy}
                            maxLength={10}
                            onChange={(e) => {
                              setCells((current) => ({
                                ...current,
                                [s.studentId]: e.target.value,
                              }));
                              setResults((current) =>
                                current.filter(
                                  (r) => r.studentId !== s.studentId,
                                ),
                              );
                            }}
                            placeholder="A / B / C / D / F / I"
                          />
                        </td>
                        <td>
                          {result && (
                            <>
                              <span
                                className={`badge ${result.outcome === "REJECTED" ? "amber" : "blue"}`}
                              >
                                {label(result.outcome)}
                              </span>
                              <small>{result.issue?.message}</small>
                            </>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>该班次暂无有效注册学生。</Empty>
      )}
      {grades && (
        <div className="panel-footer">
          <p className="hint">
            成绩可填 A、B、C、D、F、I，留空表示不修改；填写有误的格子会单独提示，其余格子照常保存。已录入的成绩不能清空。
          </p>
          <button
            className="primary"
            disabled={
              action.busy ||
              !!resource.error ||
              !Object.keys(cells).length ||
              !!removed.length
            }
            onClick={() => setConfirm(true)}
          >
            提交成绩
          </button>
        </div>
      )}
      {confirm && (
        <Confirm
          title="确认提交本次成绩？"
          busy={action.busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            void action.run(async () => {
              const data = await write<{ results: GradeResult[] }>(
                `/professor/offerings/${idPath(offering.id)}/grades`,
                "PATCH",
                {
                  cells: Object.entries(cells).map(([studentId, grade]) => ({
                    studentId,
                    grade: grade || null,
                  })),
                },
              );
              setResults(data.results);
              setCells((current) =>
                Object.fromEntries(
                  Object.entries(current).filter(([id]) =>
                    data.results.some(
                      (r) => r.studentId === id && r.outcome === "REJECTED",
                    ),
                  ),
                ),
              );
              resource.refresh();
              setConfirm(false);
            }, "已提交，请查看每名学生右侧的保存结果。")
          }
        >
          合法成绩将写入，空白不修改。失败格会保留输入供修正。
          <ActionFeedback action={action} />
        </Confirm>
      )}
    </Panel>
  );
}
