import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Navigate,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { Role } from "@wylie/contracts";
import { AuthProvider, useAuth } from "./lib/auth";
import { TermsProvider, useCurrentTerm, useTerms } from "./lib/terms";
import { write } from "./lib/api";
import { useAction } from "./lib/hooks";
import { dateTime, label } from "./lib/format";
import {
  ActionFeedback,
  Confirm,
  Empty,
  ErrorBox,
  Loading,
} from "./components/common";
import { AuthScreen } from "./routes/auth";
import { StudentSelection, StudentReport } from "./routes/student";
import { ProfessorTeaching, ProfessorRoster } from "./routes/professor";
import { PeoplePage } from "./routes/people";
import { ImportsPage } from "./routes/imports";
import { TermWindowsPage } from "./routes/term-windows";
import { ClosePage } from "./routes/close";
import "./styles.css";

const navigation: Record<Role, { to: string; name: string; mark: string }[]> = {
  STUDENT: [
    { to: "/student/selection", name: "选课与我的课表", mark: "▦" },
    { to: "/student/report", name: "成绩单", mark: "▤" },
  ],
  PROFESSOR: [
    { to: "/professor/teaching", name: "授课选择", mark: "▦" },
    { to: "/professor/roster", name: "学生名册", mark: "▤" },
    { to: "/professor/grades", name: "成绩录入", mark: "✓" },
  ],
  REGISTRAR: [
    { to: "/registrar/students", name: "学生管理", mark: "◉" },
    { to: "/registrar/professors", name: "教授管理", mark: "◉" },
    { to: "/registrar/imports", name: "批量导入", mark: "↑" },
    { to: "/registrar/windows", name: "学期窗口", mark: "▦" },
    { to: "/registrar/close", name: "关闭、计费与补选", mark: "✓" },
  ],
};
function Root() {
  const { auth, loading } = useAuth();
  if (loading)
    return (
      <div className="boot">
        <Loading />
      </div>
    );
  if (!auth || auth.user.mustChangePassword)
    return <AuthScreen key={auth?.user.id ?? "login"} />;
  return (
    <TermsProvider>
      <Shell />
    </TermsProvider>
  );
}
function Shell() {
  const { auth, setAuth } = useAuth();
  const { error, refresh } = useTerms();
  const term = useCurrentTerm();
  const action = useAction();
  const [logout, setLogout] = useState(false);
  if (!auth) return null;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-mark">W</span>
          <span>
            Wylie<small>校园选课系统</small>
          </span>
        </Link>
        <div className="sidebar-label">{label(auth.user.role)}工作台</div>
        <nav aria-label="业务导航">
          {navigation[auth.user.role].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeProps={{ className: "active", "aria-current": "page" }}
            >
              <span aria-hidden="true">{item.mark}</span>
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="identity">
            <div className="avatar" aria-hidden="true">
              {auth.user.name.slice(0, 1)}
            </div>
            <div>
              <strong>{auth.user.name}</strong>
              <small>
                {auth.user.account} · {label(auth.user.role)}
              </small>
            </div>
          </div>
          <button onClick={() => setLogout(true)}>
            退出登录 <span aria-hidden="true">↗</span>
          </button>
          <small>会话有效至 {dateTime(auth.expiresAt)}</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="muted">当前学期</span>
            <strong>{term?.name ?? "尚未取得学期"}</strong>
            {term && <span className="badge blue">{label(term.phase)}</span>}
          </div>
          <span className="muted">北京时间 · 数据以服务器确认为准</span>
        </header>
        <main id="main-content" tabIndex={-1}>
          <ErrorBox error={error && new Error(error)} />
          {error && <button onClick={refresh}>重新读取学期</button>}
          <ActionFeedback action={action} />
          <Outlet />
        </main>
        <footer className="footer">
          Wylie College · 教学业务平台<span>保存 ≠ 注册 · 送达 ≠ 收款</span>
        </footer>
      </div>
      {logout && (
        <Confirm
          title="确认退出登录？"
          busy={action.busy}
          onCancel={() => setLogout(false)}
          onConfirm={() =>
            void action.run(async () => {
              await write("/auth/logout", "POST", {});
              setAuth(null);
            }, "")
          }
        >
          未保存的本地编辑将丢失，请先核对。
          <ActionFeedback action={action} />
        </Confirm>
      )}
    </div>
  );
}
function Home() {
  const { auth } = useAuth();
  return auth ? (
    <Navigate to={navigation[auth.user.role][0]!.to} replace />
  ) : null;
}
function Guard({ role, children }: { role: Role; children: React.ReactNode }) {
  const { auth } = useAuth();
  return auth?.user.role === role ? (
    children
  ) : (
    <Empty>
      此页面不属于当前角色。
      <p>
        <Link to="/">返回本人工作台</Link>
      </p>
    </Empty>
  );
}
const rootRoute = createRootRoute({
  component: Root,
  notFoundComponent: () => (
    <Empty>
      页面不存在。
      <p>
        <Link to="/">返回工作台</Link>
      </p>
    </Empty>
  ),
  errorComponent: () => (
    <div className="alert error" role="alert">
      页面加载异常，请刷新后重试。
      <button onClick={() => window.location.reload()}>刷新页面</button>
    </div>
  ),
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
});
const selection = createRoute({
  getParentRoute: () => rootRoute,
  path: "/student/selection",
  component: () => (
    <Guard role="STUDENT">
      <StudentSelection />
    </Guard>
  ),
});
const report = createRoute({
  getParentRoute: () => rootRoute,
  path: "/student/report",
  component: () => (
    <Guard role="STUDENT">
      <StudentReport />
    </Guard>
  ),
});
const teaching = createRoute({
  getParentRoute: () => rootRoute,
  path: "/professor/teaching",
  component: () => (
    <Guard role="PROFESSOR">
      <ProfessorTeaching />
    </Guard>
  ),
});
const roster = createRoute({
  getParentRoute: () => rootRoute,
  path: "/professor/roster",
  component: () => (
    <Guard role="PROFESSOR">
      <ProfessorRoster />
    </Guard>
  ),
});
const grades = createRoute({
  getParentRoute: () => rootRoute,
  path: "/professor/grades",
  component: () => (
    <Guard role="PROFESSOR">
      <ProfessorRoster grades />
    </Guard>
  ),
});
const students = createRoute({
  getParentRoute: () => rootRoute,
  path: "/registrar/students",
  component: () => (
    <Guard role="REGISTRAR">
      <PeoplePage kind="students" />
    </Guard>
  ),
});
const professors = createRoute({
  getParentRoute: () => rootRoute,
  path: "/registrar/professors",
  component: () => (
    <Guard role="REGISTRAR">
      <PeoplePage kind="professors" />
    </Guard>
  ),
});
const imports = createRoute({
  getParentRoute: () => rootRoute,
  path: "/registrar/imports",
  component: () => (
    <Guard role="REGISTRAR">
      <ImportsPage />
    </Guard>
  ),
});
const windows = createRoute({
  getParentRoute: () => rootRoute,
  path: "/registrar/windows",
  component: () => (
    <Guard role="REGISTRAR">
      <TermWindowsPage />
    </Guard>
  ),
});
const close = createRoute({
  getParentRoute: () => rootRoute,
  path: "/registrar/close",
  component: () => (
    <Guard role="REGISTRAR">
      <ClosePage />
    </Guard>
  ),
});
const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    selection,
    report,
    teaching,
    roster,
    grades,
    students,
    professors,
    imports,
    windows,
    close,
  ]),
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>,
);
