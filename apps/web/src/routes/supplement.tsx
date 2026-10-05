import { useCallback, useState } from "react";
import type {
  BillingSummary,
  Catalog,
  PersonView,
  Schedule,
} from "@wylie/contracts";
import { api, idPath, write } from "../lib/api";
import { useAction, useResource } from "../lib/hooks";
import { OfferingTable } from "../components/catalog";
import {
  ActionFeedback,
  Confirm,
  Empty,
  ErrorBox,
  Loading,
  Panel,
} from "../components/common";

type Context = { student: PersonView; schedule: Schedule; catalog: Catalog };
export function Supplement({
  termId,
  onSaved,
}: {
  termId: string;
  onSaved: () => void;
}) {
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<PersonView[]>([]);
  const [studentId, setStudentId] = useState("");
  const action = useAction();
  return (
    <Panel title="关闭后教务补选">
      <p className="hint">
        仅在读学生；最多四门，仍校验教授、容量、先修、时间和同课程。成功后产生新版账单。
      </p>
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            const data = await api<{ items: PersonView[] }>(
              `/registrar/students?q=${encodeURIComponent(query)}&page=1&pageSize=20`,
            );
            setStudents(data.items);
          }, "");
        }}
      >
        <label className="grow">
          查找学生
          <input
            required
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="学生编号或姓名"
          />
        </label>
        <button disabled={action.busy}>查找</button>
      </form>
      <ActionFeedback action={action} />
      {students.length > 0 && (
        <label className="inline-field">
          选择学生
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            <option value="">请选择</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.account} · {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {studentId && (
        <SupplementEditor
          key={studentId}
          studentId={studentId}
          termId={termId}
          onSaved={onSaved}
        />
      )}
    </Panel>
  );
}
function SupplementEditor({
  studentId,
  termId,
  onSaved,
}: {
  studentId: string;
  termId: string;
  onSaved: () => void;
}) {
  const base = `/registrar/terms/${idPath(termId)}`;
  const load = useCallback(
    (signal: AbortSignal) =>
      api<Context>(
        `${base}/supplement-context?studentId=${idPath(studentId)}`,
        { signal },
      ),
    [base, studentId],
  );
  const resource = useResource(load, 1000);
  const action = useAction();
  const [pending, setPending] = useState<{
    offeringId: string;
    version: number;
    name: string;
  } | null>(null);
  const data = resource.data;
  return (
    <>
      <ErrorBox error={resource.error && new Error(resource.error)} />
      <ActionFeedback action={action} />
      {resource.loading && <Loading />}
      {data && (
        <>
          <h3>
            {data.student.account} · {data.student.name}
          </h3>
          <p className="hint">
            已注册：
            {data.schedule.registrations
              .map(
                (r) =>
                  data.catalog.offerings.find((o) => o.id === r.offeringId)
                    ?.courseName ?? r.offeringId,
              )
              .join("、") || "无"}{" "}
            · v{data.schedule.version}
          </p>
          <OfferingTable
            offerings={data.catalog.offerings}
            actions={(o) => (
              <button
                disabled={
                  action.busy ||
                  !!resource.error ||
                  data.student.status !== "ACTIVE" ||
                  data.schedule.registrations.length >= 4 ||
                  o.status === "CANCELLED" ||
                  !o.professor ||
                  o.enrolledCount >= o.capacity ||
                  data.schedule.registrations.some((r) => r.offeringId === o.id)
                }
                onClick={() =>
                  setPending({
                    offeringId: o.id,
                    version: data.schedule.version,
                    name: o.courseName,
                  })
                }
              >
                补选此班次
              </button>
            )}
          />
        </>
      )}
      {!data && !resource.loading && !resource.error && (
        <Empty>未取得学生补选上下文。</Empty>
      )}
      {pending && (
        <Confirm
          title={`确认补选 ${pending.name}？`}
          busy={action.busy}
          onCancel={() => setPending(null)}
          onConfirm={() =>
            void action.run(async () => {
              if (resource.data?.schedule.version !== pending.version)
                throw new Error("学生课表已变化，请取消后重新选择并核对。");
              try {
                await write<{ schedule: Schedule; billing: BillingSummary }>(
                  `${base}/supplements`,
                  "POST",
                  {
                    studentId,
                    offeringId: pending.offeringId,
                    expectedVersion: pending.version,
                    confirmed: true,
                  },
                );
                setPending(null);
                onSaved();
              } finally {
                resource.refresh();
              }
            }, "补选成功，账单已更新为完整新版，请核对送达状态。")
          }
        >
          学生 {data?.student.account} · {data?.student.name}，班次{" "}
          {pending.offeringId}。本次将增加注册并生成完整新版账单。
          <ActionFeedback action={action} />
        </Confirm>
      )}
    </>
  );
}
