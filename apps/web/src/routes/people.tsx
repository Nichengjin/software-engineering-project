import { useCallback, useState } from "react";
import type {
  PersonView,
  StudentInput,
  ProfessorInput,
  Impact,
} from "@wylie/contracts";
import { api, idPath, write } from "../lib/api";
import { useAction, useResource } from "../lib/hooks";
import { dateTime, label } from "../lib/format";
import {
  ActionFeedback,
  Confirm,
  Empty,
  ErrorBox,
  Loading,
  Panel,
} from "../components/common";

type PersonKind = "students" | "professors";
type Credential = { account: string; initialPassword: string };
type PersonList = {
  items: PersonView[];
  total: number;
  page: number;
  pageSize: number;
};
type PersonPatch = Partial<StudentInput | ProfessorInput>;

export function PeoplePage({ kind }: { kind: PersonKind }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<PersonView | "new" | null>(null);
  const [credential, setCredential] = useState<Credential | null>(null);
  const [deleting, setDeleting] = useState<PersonView | null>(null);
  const action = useAction();
  const base = `/registrar/${kind}`;
  const load = useCallback(
    (signal: AbortSignal) =>
      api<PersonList>(
        `${base}?q=${encodeURIComponent(search)}&page=${page}&pageSize=20`,
        { signal },
      ),
    [base, search, page],
  );
  const resource = useResource(load);
  const title = kind === "students" ? "学生" : "教授";
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">教务 / 人员资料</span>
          <h1>{title}管理</h1>
          <p>人员状态变化先预览影响；停用账号只撤销会话，不自动退课。</p>
        </div>
        <button
          className="primary"
          disabled={action.busy}
          onClick={() => {
            setEditor("new");
            setCredential(null);
          }}
        >
          新增{title}
        </button>
      </div>
      <ActionFeedback action={action} />
      <ErrorBox error={resource.error && new Error(resource.error)} />
      {credential && (
        <CredentialPanel
          credential={credential}
          dismiss={() => setCredential(null)}
        />
      )}
      {editor && (
        <PersonEditor
          key={editor === "new" ? "new" : `${editor.id}-${editor.version}`}
          kind={kind}
          person={editor === "new" ? undefined : editor}
          onCancel={() => setEditor(null)}
          onSaved={(value) => {
            setCredential(value ?? null);
            setEditor(null);
            resource.refresh();
          }}
        />
      )}
      <Panel
        title={`${title}档案`}
        extra={
          <span className="muted">共 {resource.data?.total ?? "—"} 人</span>
        }
      >
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(query);
          }}
        >
          <label className="grow">
            按编号或姓名搜索
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="输入编号或姓名"
            />
          </label>
          <button>搜索</button>
          <button type="button" onClick={resource.refresh}>
            刷新列表
          </button>
        </form>
        {resource.loading && <Loading />}
        {resource.data &&
          (resource.data.items.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>编号／姓名</th>
                    <th>出生日期</th>
                    <th>SSN（脱敏）</th>
                    <th>人员状态</th>
                    <th>{kind === "students" ? "毕业日期" : "院系"}</th>
                    <th>账户</th>
                    <th className="sticky-actions">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {resource.data.items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        <small>{p.account}</small>
                      </td>
                      <td>{p.birthDate}</td>
                      <td>{p.ssnMasked}</td>
                      <td>{label(p.status)}</td>
                      <td>
                        {p.kind === "STUDENT"
                          ? (p.graduationDate ?? "—")
                          : p.department}
                      </td>
                      <td>
                        <span
                          className={`badge ${p.accountEnabled ? "blue" : "amber"}`}
                        >
                          {p.accountEnabled ? "启用" : "已停用"}
                        </span>
                      </td>
                      <td className="sticky-actions">
                        <div className="row-actions">
                          <button
                            disabled={action.busy}
                            onClick={() =>
                              void action.run(async () => {
                                const { person } = await api<{
                                  person: PersonView;
                                }>(`${base}/${idPath(p.id)}`);
                                setEditor(person);
                              }, "")
                            }
                          >
                            编辑
                          </button>
                          <button
                            className="danger"
                            disabled={action.busy}
                            onClick={() => setDeleting(p)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>没有符合搜索条件的{title}。</Empty>
          ))}
        <div className="pagination">
          <button
            disabled={page <= 1 || resource.loading}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </button>
          <span>第 {page} 页</span>
          <button
            disabled={
              !resource.data ||
              page * 20 >= resource.data.total ||
              resource.loading
            }
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      </Panel>
      {deleting && (
        <Confirm
          title={`确认删除${deleting.name}？`}
          busy={action.busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            void action.run(async () => {
              try {
                await write(`${base}/${idPath(deleting.id)}`, "DELETE", {
                  expectedVersion: deleting.version,
                  confirmed: true,
                });
                setDeleting(null);
              } finally {
                resource.refresh();
              }
            }, "人员已删除。")
          }
        >
          此操作仅允许没有历史关联记录的人员。已有选课、授课或成绩记录时，服务器会拒绝；需改为停用账户或维护人员状态。
          <ActionFeedback action={action} />
        </Confirm>
      )}
    </>
  );
}

function CredentialPanel({
  credential,
  dismiss,
}: {
  credential: Credential;
  dismiss: () => void;
}) {
  return (
    <Panel
      title="一次性初始凭据"
      extra={<button onClick={dismiss}>已安全交付，关闭显示</button>}
    >
      <div className="alert warning">
        仅本次成功创建后显示，关闭或离开页面后不能再次查询。请通过安全渠道交付本人；不要截图或记录到公共文档。
      </div>
      <dl className="credential">
        <dt>账号</dt>
        <dd>{credential.account}</dd>
        <dt>初始密码</dt>
        <dd>{credential.initialPassword}</dd>
      </dl>
    </Panel>
  );
}

function PersonEditor({
  kind,
  person,
  onCancel,
  onSaved,
}: {
  kind: PersonKind;
  person: PersonView | undefined;
  onCancel: () => void;
  onSaved: (credential?: Credential) => void;
}) {
  const student = kind === "students";
  const [name, setName] = useState(person?.name ?? "");
  const [birthDate, setBirthDate] = useState(person?.birthDate ?? "");
  const [ssn, setSsn] = useState("");
  const [status, setStatus] = useState(person?.status ?? "ACTIVE");
  const [graduationDate, setGraduationDate] = useState(
    person?.kind === "STUDENT" ? (person.graduationDate ?? "") : "",
  );
  const [department, setDepartment] = useState(
    person?.kind === "PROFESSOR" ? person.department : "",
  );
  const [enabled, setEnabled] = useState(person?.accountEnabled ?? true);
  const [pending, setPending] = useState<{
    patch: PersonPatch;
    impact: Impact | null;
  } | null>(null);
  const action = useAction();
  const base = `/registrar/${kind}${person ? `/${idPath(person.id)}` : ""}`;
  const fullInput = () =>
    student
      ? ({
          name,
          birthDate,
          ssn,
          status,
          graduationDate: graduationDate || null,
          accountEnabled: enabled,
        } as StudentInput)
      : ({
          name,
          birthDate,
          ssn,
          status,
          department,
          accountEnabled: enabled,
        } as ProfessorInput);
  function patchInput(): PersonPatch {
    const input = fullInput();
    const patch = { ...input };
    if (!ssn) delete (patch as Partial<StudentInput>).ssn;
    return patch;
  }
  const preview = async () => {
    const patch = patchInput();
    const needsImpact =
      !!person && person.status === "ACTIVE" && status !== "ACTIVE";
    const impact = needsImpact
      ? (
          await write<{ impact: Impact }>(`${base}/impact-preview`, "POST", {
            expectedVersion: person!.version,
            patch,
          })
        ).impact
      : null;
    setPending({ patch, impact });
  };
  return (
    <Panel
      title={
        person
          ? `编辑 ${person.name} · ${person.account}（v${person.version}）`
          : `新增${student ? "学生" : "教授"}`
      }
      extra={
        <button disabled={action.busy} onClick={onCancel}>
          取消编辑
        </button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(preview, "");
        }}
      >
        <fieldset disabled={action.busy || !!pending}>
          <div className="form-grid">
            <label>
              姓名
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              出生日期
              <input
                required
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </label>
            <label>
              {person
                ? `新 SSN（留空保持 ${person.ssnMasked}）`
                : "SSN（按文本保留前导零）"}
              <input
                required={!person}
                type="text"
                autoComplete="off"
                value={ssn}
                onChange={(e) => setSsn(e.target.value)}
              />
            </label>
            <label>
              人员状态
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                {(student
                  ? ["ACTIVE", "SUSPENDED", "GRADUATED"]
                  : ["ACTIVE", "DEPARTED"]
                ).map((s) => (
                  <option key={s} value={s}>
                    {s === "ACTIVE" ? (student ? "在读" : "在职") : label(s)}
                  </option>
                ))}
              </select>
            </label>
            {student ? (
              <label>
                毕业日期
                <input
                  type="date"
                  required={status === "GRADUATED"}
                  value={graduationDate}
                  onChange={(e) => setGraduationDate(e.target.value)}
                />
              </label>
            ) : (
              <label>
                院系
                <input
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </label>
            )}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              启用登录账户
            </label>
          </div>
        </fieldset>
        <ActionFeedback action={action} />
        <div className="actions">
          <button className="primary" disabled={action.busy || !!pending}>
            {person ? "预览并确认修改" : "确认新增"}
          </button>
        </div>
      </form>
      {pending && (
        <Confirm
          title={person ? "确认人员资料与状态修改？" : "确认创建人员账户？"}
          busy={action.busy}
          onCancel={() => setPending(null)}
          onConfirm={() =>
            void action.run(async () => {
              if (person)
                await write(base, "PATCH", {
                  expectedVersion: person.version,
                  patch: pending.patch,
                  confirmed: true,
                  ...(pending.impact
                    ? { impactToken: pending.impact.impactToken }
                    : {}),
                });
              else {
                const result = await write<{
                  person: PersonView;
                  initialCredential: Credential;
                }>(base, "POST", fullInput());
                onSaved(result.initialCredential);
                return;
              }
              onSaved();
            }, "")
          }
        >
          <p>
            {name} · {student ? "学生" : "教授"} · {label(status)} · 账户
            {enabled ? "启用" : "停用"}
          </p>
          {!enabled && (
            <p className="warning-text">
              停用账户将撤销该账户已有会话，不自动清理课表。
            </p>
          )}
          {pending.impact && (
            <>
              <p>
                影响预览有效至 {dateTime(pending.impact.expiresAt)}
                ，提交时服务器再次核对。
              </p>
              {pending.impact.terms.length ? (
                <ul className="simple-list">
                  {pending.impact.terms.map((t) => (
                    <li key={t.termId}>
                      <strong>学期 {t.termId}</strong>
                      <small>
                        受影响班次：{t.offeringIds.join("、") || "无"}
                      </small>
                      <small>
                        {t.clearSchedule
                          ? "清空未关闭课表与注册。"
                          : "不清空课表。"}
                        {t.retainedClosedRecords ? "已关闭记录保留。" : ""}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>无关联学期受影响。</p>
              )}
              <p className="warning-text">
                状态变化会按此预览清理未关闭学期的关联业务；影响变化时必须重新预览。
              </p>
            </>
          )}
          <ActionFeedback action={action} />
        </Confirm>
      )}
    </Panel>
  );
}
