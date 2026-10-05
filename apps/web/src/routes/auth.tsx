import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Auth } from "@wylie/contracts";
import { write } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAction } from "../lib/hooks";
import { ActionFeedback, ErrorBox } from "../components/common";

export function AuthScreen() {
  const { auth, setAuth, error, reload } = useAuth();
  const navigate = useNavigate();
  const change = !!auth?.user.mustChangePassword;
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const action = useAction();
  return (
    <main className="auth-screen">
      <div className="auth-brand">
        <span className="brand-mark">W</span>
        <h1>Wylie 选课系统</h1>
        <p>课程、教学与教务，一处办理。</p>
      </div>
      <section className="auth-card">
        <span className="eyebrow">校园业务平台</span>
        <h2>{change ? "首次登录 · 修改密码" : "欢迎登录"}</h2>
        <p className="muted">
          {change
            ? "初始密码仅用于首次登录。修改后才能办理业务。"
            : "使用学校分配的账号登录，权限由学校统一设置。"}
        </p>
        <ErrorBox error={error} />
        {error ? <button onClick={reload}>重新连接</button> : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              if (change && next !== repeat)
                throw new Error("两次输入的新密码不一致。");
              const result = await write<Auth>(
                change ? "/auth/change-password" : "/auth/login",
                "POST",
                change
                  ? { currentPassword: password, newPassword: next }
                  : { account, password },
              );
              setPassword("");
              setNext("");
              setRepeat("");
              setAuth(result);
              if (!result.user.mustChangePassword)
                await navigate({ to: "/", replace: true });
            }, "");
          }}
        >
          {!change && (
            <label>
              账号
              <input
                required
                autoComplete="username"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              />
            </label>
          )}
          <label>
            {change ? "当前初始密码" : "密码"}
            <input
              required
              type="password"
              autoComplete="current-password"
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {change && (
            <>
              <label>
                新密码（10–128 字符）
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
              </label>
              <label>
                再次输入新密码
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                />
              </label>
            </>
          )}
          <ActionFeedback action={action} />
          <button className="primary full" disabled={action.busy}>
            {action.busy ? "正在处理…" : change ? "修改密码并继续" : "登录"}
          </button>
        </form>
        {change && (
          <button
            className="full"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await write("/auth/logout", "POST", {});
                setAuth(null);
              }, "")
            }
          >
            退出登录
          </button>
        )}
        <small className="muted">
          会话过期后需重新登录。请勿在公共设备保存初始凭据。
        </small>
      </section>
    </main>
  );
}
