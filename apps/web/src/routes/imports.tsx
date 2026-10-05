import { useState } from "react";
import type { ImportResult } from "@wylie/contracts";
import { api } from "../lib/api";
import { useAction } from "../lib/hooks";
import { label } from "../lib/format";
import { ActionFeedback, Confirm, Empty, Panel } from "../components/common";

const templates = {
  students: {
    name: "学生名单",
    required: "name、birthDate、ssn、status",
    optional: "graduationDate；状态 ACTIVE / SUSPENDED / GRADUATED",
  },
  professors: {
    name: "教授名单",
    required: "name、birthDate、ssn、status、department",
    optional: "状态 ACTIVE / DEPARTED",
  },
  "historical-grades": {
    name: "上线前历史成绩",
    required: "studentNumber、courseId、termId、grade",
    optional: "成绩 A / B / C / D / F / I；只导入上线前学期",
  },
  qualifications: {
    name: "教授授课资格",
    required: "professorNumber、courseId",
    optional: "重复资格跳过，不撤销已有资格",
  },
};
export function ImportsPage() {
  const [kind, setKind] = useState<keyof typeof templates>("students");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [credentialVisible, setCredentialVisible] = useState(true);
  const action = useAction();
  const template = templates[kind];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">教务 / 初始化数据</span>
          <h1>批量导入</h1>
          <p>
            逐行独立处理，后续行失败不撤销已成功行。人员初始凭据只在本次成功结果显示。
          </p>
        </div>
      </div>
      <Panel title="上传 xlsx">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              if (!file || !file.name.toLowerCase().endsWith(".xlsx"))
                throw new Error("请选择 .xlsx 文件。");
              if (file.size > 5 * 1024 * 1024)
                throw new Error("文件不能超过 5 MiB。");
              setConfirm(true);
            }, "");
          }}
        >
          <div className="form-grid">
            <label>
              导入类型
              <select
                disabled={action.busy}
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as keyof typeof templates);
                  setResult(null);
                }}
              >
                {Object.entries(templates).map(([value, t]) => (
                  <option key={value} value={value}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              选择文件
              <span className="file-picker">
                <span className="file-button" aria-hidden="true">
                  选择 xlsx 文件
                </span>
                <span>{file?.name ?? "尚未选择文件"}</span>
                <input
                  required
                  aria-label="选择 xlsx 文件"
                  type="file"
                  accept=".xlsx"
                  disabled={action.busy}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </span>
            </label>
          </div>
          <div className="template-note">
            <strong>{template.name}模板</strong>
            <p>首个工作表第一行字段名：{template.required}</p>
            <p>{template.optional}</p>
            <small>
              日期 YYYY-MM-DD；SSN、编号使用文本保留前导零。最多 5000 行、50
              列、压缩 5 MiB / 展开 20 MiB，不接受公式或外部链接。
            </small>
          </div>
          <ActionFeedback action={action} />
          <button className="primary" disabled={action.busy || !file}>
            检查并导入
          </button>
        </form>
      </Panel>
      <Panel
        title="逐行导入结果"
        extra={
          result?.rows.some((r) => r.initialPassword) && credentialVisible ? (
            <button onClick={() => setCredentialVisible(false)}>
              已交付，隐藏全部初始密码
            </button>
          ) : undefined
        }
      >
        {result ? (
          <>
            <div className="stats">
              <div>
                <strong>{result.imported}</strong>
                <span>成功导入</span>
              </div>
              <div>
                <strong>{result.skipped}</strong>
                <span>重复跳过</span>
              </div>
              <div>
                <strong>{result.rejected}</strong>
                <span>拒绝</span>
              </div>
            </div>
            {result.rows.some((r) => r.initialPassword) &&
              credentialVisible && (
                <div className="alert warning">
                  下面的初始凭据仅本次显示，不会保存到浏览器。请通过安全渠道交付，勿截图分享。
                </div>
              )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Excel 行号</th>
                    <th>结果</th>
                    <th>账号</th>
                    <th>一次性初始密码</th>
                    <th>原因</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.row}>
                      <td>{row.row}</td>
                      <td>
                        <span
                          className={`badge ${row.outcome === "REJECTED" ? "amber" : "blue"}`}
                        >
                          {label(row.outcome)}
                        </span>
                      </td>
                      <td>{row.account ?? "—"}</td>
                      <td>
                        {row.initialPassword
                          ? credentialVisible
                            ? row.initialPassword
                            : "已隐藏"
                          : "—"}
                      </td>
                      <td>
                        {row.issues.map((i) => i.message).join("；") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <Empty>上传文件后，逐行结果会显示在这里。</Empty>
        )}
      </Panel>
      {confirm && (
        <Confirm
          title={`确认导入${template.name}？`}
          busy={action.busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            void action.run(async () => {
              if (!file) throw new Error("请选择文件。");
              const body = new FormData();
              body.append("file", file);
              setResult(null);
              const value = await api<ImportResult>(
                `/registrar/imports/${kind}`,
                { method: "POST", body },
              );
              setResult(value);
              setCredentialVisible(true);
              setConfirm(false);
            }, "文件处理已完成，请核对成功、跳过与拒绝的逐行结果。")
          }
        >
          文件：{file?.name}
          。已成功行不会因其他行失败而回滚。若响应丢失，不会自动重新上传；重导会跳过已存在人员，不能恢复一次性初始密码。
          <ActionFeedback action={action} />
        </Confirm>
      )}
    </>
  );
}
