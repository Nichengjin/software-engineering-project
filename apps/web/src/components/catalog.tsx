import type { Offering } from "@wylie/contracts";
import type { ReactNode } from "react";
import { useState } from "react";
import { label, meeting } from "../lib/format";
import { Empty } from "./common";

export function OfferingTable({
  offerings,
  actions,
}: {
  offerings: Offering[];
  actions?: (offering: Offering) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [available, setAvailable] = useState(false);
  const filtered = offerings.filter(
    (o) =>
      (!department || o.department === department) &&
      (!available || o.enrolledCount < o.capacity) &&
      `${o.courseName} ${o.courseId} ${o.id} ${o.professor?.name ?? ""}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      <div className="filters">
        <label className="grow">
          搜索课程
          <input
            type="search"
            placeholder="课程名称、课程号、班次或教授"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          开课院系
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">全部院系</option>
            {[...new Set(offerings.map((o) => o.department))].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
          />
          只看有名额
        </label>
      </div>
      {filtered.length === 0 ? (
        <Empty>
          {offerings.length
            ? "没有符合筛选条件的班次。"
            : "该学期暂无课程班次。"}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>课程／班次</th>
                <th>学分／院系</th>
                <th>先修要求</th>
                <th>上课时间</th>
                <th>授课教授</th>
                <th>已选／容量</th>
                {actions && <th className="sticky-actions">操作</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.courseName}</strong>
                    <small>
                      {o.courseId} · {o.id}
                    </small>
                    <span className="badge">{label(o.status)}</span>
                  </td>
                  <td>
                    {o.credits}
                    <small>{o.department}</small>
                  </td>
                  <td>{o.prerequisiteCourseIds.join("、") || "无"}</td>
                  <td className="meeting">
                    {o.meetings.length
                      ? o.meetings.map((m, i) => (
                          <small key={i}>{meeting(m)}</small>
                        ))
                      : "暂无时段"}
                  </td>
                  <td>{o.professor?.name ?? "尚无教授"}</td>
                  <td>
                    <span
                      className={
                        o.enrolledCount >= o.capacity ? "warning-text" : ""
                      }
                    >
                      {o.enrolledCount}/{o.capacity}
                    </span>
                    {o.enrolledCount >= o.capacity && (
                      <small>
                        <span className="badge amber">已满</span>
                      </small>
                    )}
                  </td>
                  {actions && (
                    <td className="sticky-actions">
                      <div className="row-actions">{actions(o)}</div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
