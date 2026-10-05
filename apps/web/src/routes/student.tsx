import { useCallback, useMemo, useState } from "react";
import type {
  Catalog,
  Choices,
  Notice,
  Schedule,
  ReportRow,
  Term,
} from "@wylie/contracts";
import { api, idPath, write } from "../lib/api";
import { useAction, useResource, useVersionedDraft } from "../lib/hooks";
import { useCurrentTerm } from "../lib/terms";
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
import { OfferingTable } from "../components/catalog";

export function StudentSelection() {
  const term = useCurrentTerm();
  return term ? (
    <Selection key={term.id} term={term} />
  ) : (
    <Empty>尚未取得当前学期，请刷新或联系教务。</Empty>
  );
}
function Selection({ term }: { term: Term }) {
  const base = `/student/terms/${idPath(term.id)}`;
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [catalog, { schedule }, { notices }] = await Promise.all([
        api<Catalog>(`/catalog?termId=${idPath(term.id)}`, { signal }),
        api<{ schedule: Schedule }>(`${base}/schedule`, { signal }),
        api<{ notices: Notice[] }>(`${base}/notices`, { signal }),
      ]);
      return { catalog, schedule, notices };
    },
    [term.id, base],
  );
  const resource = useResource(load, 1000);
  const server = useMemo(
    () =>
      resource.data
        ? {
            version: resource.data.schedule.version,
            value: resource.data.schedule.saved,
          }
        : undefined,
    [resource.data],
  );
  const edit = useVersionedDraft(server);
  const action = useAction();
  const [confirm, setConfirm] = useState<"submit" | "delete" | "adopt" | null>(
    null,
  );
  const data = resource.data;
  const choices = edit.draft?.value;
  const writable =
    term.closeState === "OPEN" && ["INITIAL", "ADD_DROP"].includes(term.phase);
  const blocked = !writable || edit.stale || action.busy || !!resource.error;
  const title = (id: string) =>
    data?.catalog.offerings.find((o) => o.id === id)?.courseName ??
    `班次 ${id}（目录已变更）`;
  function select(id: string, kind: keyof Choices) {
    if (!choices) return;
    edit.change({ ...choices, [kind]: [...choices[kind], id] });
    action.clear();
  }
  function remove(id: string, kind: keyof Choices) {
    if (choices)
      edit.change({
        ...choices,
        [kind]: choices[kind].filter((value) => value !== id),
      });
  }
  function reorder(index: number, direction: number) {
    if (!choices) return;
    const next = [...choices.alternateOfferingIds];
    [next[index], next[index + direction]] = [
      next[index + direction]!,
      next[index]!,
    ];
    edit.change({ ...choices, alternateOfferingIds: next });
  }
  async function persist(kind: "save" | "submit" | "delete") {
    if (!edit.draft || blocked)
      throw new Error("当前课表不能提交，请先刷新核对版本与学期状态。");
    const path = `${base}/schedule${kind === "submit" ? "/submit" : ""}`;
    try {
      const { schedule } = await write<{ schedule: Schedule }>(
        path,
        kind === "save" ? "PUT" : kind === "submit" ? "POST" : "DELETE",
        kind === "delete"
          ? { expectedVersion: edit.draft.version, confirmed: true }
          : { ...edit.draft.value, expectedVersion: edit.draft.version },
      );
      edit.accept(schedule.version, schedule.saved);
      setConfirm(null);
    } finally {
      resource.refresh();
    }
  }
  const countValid =
    !!data &&
    !!choices &&
    (data.schedule.firstSubmittedAt
      ? choices.primaryOfferingIds.length >= 1 &&
        choices.primaryOfferingIds.length <= 4 &&
        choices.alternateOfferingIds.length <= 2
      : choices.primaryOfferingIds.length === 4 &&
        choices.alternateOfferingIds.length === 2);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">学生 / 选课工作台</span>
          <h1>规划本学期的课程</h1>
          <p>保存只保留选择；正式提交通过校验后才注册主选班次。</p>
        </div>
        <Freshness updatedAt={resource.updatedAt} error={resource.error} />
      </div>
      <ErrorBox
        error={resource.error ? new Error(resource.error) : undefined}
      />
      {!writable && (
        <div className="alert warning">
          当前为{label(term.phase)}，不能保存、提交或删除课表。
        </div>
      )}
      {edit.stale && (
        <div className="alert warning" role="alert">
          <strong>
            服务器课表已变更（本地 v{edit.draft?.version} / 服务器 v
            {server?.version}）。本地编辑已保留，不能以新版本提交旧编辑。
          </strong>
          <p>
            服务器已保存主选：
            {server?.value.primaryOfferingIds.map(title).join("、") || "无"}
            ；备选：
            {server?.value.alternateOfferingIds.map(title).join("、") || "无"}。
          </p>
          <button onClick={() => setConfirm("adopt")}>
            采用服务器版本并重新编辑
          </button>
        </div>
      )}
      <ActionFeedback action={action} />
      {resource.loading && <Loading />}
      {data && choices && (
        <div className="selection-layout">
          <div className="selection-main">
            <Panel
              title="课程目录"
              extra={
                <span className="muted">
                  {data.catalog.offerings.length} 个班次
                </span>
              }
            >
              <OfferingTable
                offerings={data.catalog.offerings}
                actions={(offering) => {
                  const selected = [
                    ...choices.primaryOfferingIds,
                    ...choices.alternateOfferingIds,
                  ].includes(offering.id);
                  if (selected)
                    return <span className="badge blue">已选择</span>;
                  const alreadyRegistered = data.schedule.registrations.some(
                    (r) => r.offeringId === offering.id,
                  );
                  return (
                    <>
                      <button
                        disabled={
                          blocked ||
                          offering.status !== "OPEN" ||
                          (!alreadyRegistered &&
                            offering.enrolledCount >= offering.capacity) ||
                          choices.primaryOfferingIds.length >= 4
                        }
                        onClick={() =>
                          select(offering.id, "primaryOfferingIds")
                        }
                      >
                        主选
                      </button>
                      <button
                        disabled={
                          blocked ||
                          offering.status !== "OPEN" ||
                          choices.alternateOfferingIds.length >= 2
                        }
                        onClick={() =>
                          select(offering.id, "alternateOfferingIds")
                        }
                      >
                        备选
                      </button>
                    </>
                  );
                }}
              />
              <p className="hint">
                额满仍可备选；备选仅在关闭调剂时尝试，不预占名额。先修、冲突等由服务器最终校验。
              </p>
            </Panel>
            <Panel title="有效注册（不是已保存选择）">
              {data.schedule.registrations.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>课程／班次</th>
                        <th>来源</th>
                        <th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.schedule.registrations.map((r) => (
                        <tr key={r.offeringId}>
                          <td>
                            {title(r.offeringId)}
                            <small>{r.offeringId}</small>
                            {!data.schedule.saved.primaryOfferingIds.includes(
                              r.offeringId,
                            ) && (
                              <small className="warning-text">
                                仍已注册，正式提交后才退出
                              </small>
                            )}
                          </td>
                          <td>{label(r.source)}</td>
                          <td>{label(r.state)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>尚无有效注册。保存选择不会占用名额。</Empty>
              )}
            </Panel>
            <Panel title="目录变更通知">
              <NoticeList notices={data.notices} />
            </Panel>
          </div>
          <aside className="selection-aside">
            <Panel
              title="我的选课选择"
              extra={
                <span className="badge">
                  {edit.draft?.dirty ? "本地未保存" : "已同步"}
                </span>
              }
            >
              <p className="hint">
                {data.schedule.firstSubmittedAt
                  ? "后续提交：1–4 门主选，0–2 门备选。"
                  : "首次提交：必须 4 门主选 + 2 门备选。"}
              </p>
              {(["primaryOfferingIds", "alternateOfferingIds"] as const).map(
                (kind) => (
                  <section className="choices" key={kind}>
                    <h3>
                      {kind === "primaryOfferingIds"
                        ? "主选课程"
                        : "备选课程 · 按优先级"}
                      <span>
                        {choices[kind].length}/
                        {kind === "primaryOfferingIds" ? 4 : 2}
                      </span>
                    </h3>
                    <ol>
                      {choices[kind].map((id, index) => (
                        <li key={id}>
                          <span className="choice-number">{index + 1}</span>
                          <div className="grow">
                            <strong>{title(id)}</strong>
                            <small>{id}</small>
                            {kind === "primaryOfferingIds" &&
                              !data.schedule.registrations.some(
                                (r) => r.offeringId === id,
                              ) && (
                                <small className="muted">仅选择 · 未注册</small>
                              )}
                          </div>
                          <div className="choice-controls">
                            {kind === "alternateOfferingIds" && (
                              <>
                                <button
                                  aria-label={`上移备选 ${title(id)}`}
                                  disabled={blocked || index === 0}
                                  onClick={() => reorder(index, -1)}
                                >
                                  ↑
                                </button>
                                <button
                                  aria-label={`下移备选 ${title(id)}`}
                                  disabled={
                                    blocked ||
                                    index === choices[kind].length - 1
                                  }
                                  onClick={() => reorder(index, 1)}
                                >
                                  ↓
                                </button>
                              </>
                            )}
                            <button
                              aria-label={`移除${title(id)}`}
                              disabled={blocked}
                              onClick={() => remove(id, kind)}
                            >
                              ×
                            </button>
                          </div>
                        </li>
                      ))}
                    </ol>
                    {!choices[kind].length && (
                      <Empty>
                        从目录添加
                        {kind === "primaryOfferingIds" ? "主选" : "备选"}班次。
                      </Empty>
                    )}
                  </section>
                ),
              )}
              <div className="actions">
                <button
                  disabled={blocked}
                  onClick={() =>
                    void action.run(
                      () => persist("save"),
                      "选择已保存，不预留名额。",
                    )
                  }
                >
                  保存选择
                </button>
                <button
                  className="primary"
                  disabled={blocked || !countValid}
                  onClick={() => setConfirm("submit")}
                >
                  正式提交
                </button>
              </div>
              {!countValid && (
                <p className="hint">当前数量不满足正式提交要求。</p>
              )}
              <button
                className="danger full"
                disabled={blocked || !data.schedule.exists}
                onClick={() => setConfirm("delete")}
              >
                删除整个课表
              </button>
              <p className="hint">
                首次成功提交：{dateTime(data.schedule.firstSubmittedAt)}
                <br />
                本地编辑基线：v{edit.draft?.version} · 服务器：v
                {data.schedule.version}
              </p>
            </Panel>
          </aside>
        </div>
      )}
      {confirm && (
        <Confirm
          title={
            confirm === "adopt"
              ? "放弃本地副本，采用服务器版本？"
              : confirm === "delete"
                ? "确认删除整个课表？"
                : "确认正式提交课表？"
          }
          busy={action.busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === "adopt") {
              edit.adopt();
              setConfirm(null);
              action.clear();
            } else
              void action.run(
                () => persist(confirm),
                confirm === "delete"
                  ? "课表已删除，有效注册已退出。"
                  : "正式提交成功，主选班次已注册。",
              );
          }}
        >
          {confirm === "adopt"
            ? "此操作会丢弃右侧保留的本地未保存编辑。"
            : confirm === "delete"
              ? "将清空已保存选择、最后提交选择和有效注册；再次提交将按首次 4+2 校验。"
              : "将提交当前整份主选和有序备选。任一校验失败，原注册与已保存选择保持不变。"}
          <ActionFeedback action={action} />
        </Confirm>
      )}
    </>
  );
}
function NoticeList({ notices }: { notices: Notice[] }) {
  return notices.length ? (
    <ul className="notice-list">
      {notices.map((n) => (
        <li key={n.id}>
          <span className={`badge ${n.resolved ? "" : "amber"}`}>
            {n.resolved ? "已解决" : label(n.kind)}
          </span>
          <div>
            <strong>{n.message}</strong>
            <small>
              {n.offeringId} · {dateTime(n.createdAt)}
            </small>
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <Empty>暂无目录变更通知。</Empty>
  );
}
export function StudentReport() {
  const load = useCallback(
    (signal: AbortSignal) =>
      api<{ term: Term | null; rows: ReportRow[] }>("/student/report-card", {
        signal,
      }),
    [],
  );
  const resource = useResource(load);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">学生 / 学习记录</span>
          <h1>我的成绩单</h1>
          <p>仅显示上一已完成学期；关闭选课不代表学期已经完成。</p>
        </div>
        <button onClick={resource.refresh}>刷新成绩</button>
      </div>
      <ErrorBox error={resource.error && new Error(resource.error)} />
      {resource.loading && <Loading />}
      <Panel title={resource.data?.term?.name ?? "上一完成学期"}>
        {resource.data?.rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>课程号</th>
                  <th>课程名称</th>
                  <th>班次</th>
                  <th>成绩</th>
                  <th>来源</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.rows.map((row, i) => (
                  <tr key={`${row.courseId}-${i}`}>
                    <td>{row.courseId}</td>
                    <td>{row.courseName}</td>
                    <td>{row.offeringId ?? "历史记录"}</td>
                    <td>
                      <strong>{row.grade ?? "未录入"}</strong>
                    </td>
                    <td>{row.source === "IMPORT" ? "历史导入" : "教授录入"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            {resource.data?.term ? "该学期暂无成绩记录。" : "暂无已完成学期。"}
          </Empty>
        )}
      </Panel>
    </>
  );
}
