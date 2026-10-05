import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, message } from "../lib/api";

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="alert error" role="alert">
      <strong>{message(error)}</strong>
      {error instanceof ApiError && (
        <>
          {error.failure.error.issues?.length > 0 && (
            <ul>
              {error.failure.error.issues.map((issue, i) => (
                <li key={i}>
                  {issue.row ? `第 ${issue.row} 行：` : ""}
                  {issue.field ? `${issue.field}：` : ""}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
          <small>
            请求编号：{error.failure.requestId} · 错误代码：
            {error.failure.error.code}
          </small>
        </>
      )}
    </div>
  );
}
export function ActionFeedback({
  action,
}: {
  action: { error: unknown; success: string };
}) {
  return (
    <>
      <ErrorBox error={action.error} />
      {action.success && (
        <div className="alert success" role="status">
          {action.success}
        </div>
      )}
    </>
  );
}
export function Empty({ children = "暂无数据。" }: { children?: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Loading() {
  return (
    <div className="empty" role="status">
      正在加载…
    </div>
  );
}
export function Panel({
  title,
  children,
  extra,
}: {
  title: string;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}
export function Confirm({
  title,
  children,
  busy,
  onCancel,
  onConfirm,
  confirmLabel = "确认操作",
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      <div className="dialog-body">{children}</div>
      <div className="actions">
        <button ref={cancelRef} disabled={busy} onClick={onCancel}>
          取消
        </button>
        <button className="primary" disabled={busy} onClick={onConfirm}>
          {busy ? "正在处理…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
export function Freshness({
  updatedAt,
  error,
}: {
  updatedAt?: number | undefined;
  error?: string | undefined;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const age = updatedAt ? Math.floor((now - updatedAt) / 1000) : null;
  return (
    <span
      className={
        error || (age !== null && age > 5) ? "muted warning-text" : "muted"
      }
    >
      {error
        ? "连接异常 · 显示最后成功读取的数据"
        : age !== null && age > 5
          ? `数据已 ${age} 秒未更新，请检查连接或刷新`
          : updatedAt
            ? `最近更新 ${new Date(updatedAt).toLocaleTimeString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}`
            : "等待服务器数据"}
    </span>
  );
}
