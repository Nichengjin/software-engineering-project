import type { Meeting } from "@wylie/contracts";

const labels: Record<string, string> = {
  STUDENT: "学生",
  PROFESSOR: "教授",
  REGISTRAR: "教务员",
  ACTIVE: "在读／在职",
  SUSPENDED: "休学",
  GRADUATED: "毕业",
  DEPARTED: "离职",
  OPEN: "开放",
  CLOSED: "已关闭",
  CANCELLED: "已取消",
  CLOSING: "关闭处理中",
  BEFORE_TEACHING: "授课选择尚未开始",
  TEACHING: "授课选择期",
  INITIAL: "初选期",
  GAP: "选课空档期",
  ADD_DROP: "加退选期",
  AWAITING_CLOSE: "等待关闭",
  PENDING: "待送达",
  IN_FLIGHT: "发送中",
  RETRY: "等待重试",
  ACKNOWLEDGED: "已确认送达",
  SUPERSEDED: "已被新版替代",
  ENROLLED: "已注册",
  COMMITTED: "已确定",
  SUBMIT: "正式提交",
  LEVELING: "关闭调剂",
  SUPPLEMENT: "教务补选",
  SAVED: "已保存",
  UNCHANGED: "未修改",
  REJECTED: "失败",
  IMPORTED: "已导入",
  SKIPPED: "已跳过",
  NO_PROFESSOR: "无授课教授",
  UNDER_MINIMUM: "不足 3 人",
  CATALOG_DELETED: "目录已删除",
  TIME_CONFLICT: "时间冲突",
  PREREQUISITE: "先修要求",
  OFFERING_DELETED: "班次删除",
};
export const label = (value: string) => labels[value] ?? value;
export const dateTime = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "—";
export const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const meeting = (m: Meeting) =>
  `周${"一二三四五六日"[m.dayOfWeek - 1]} ${clock(m.startMinute)}–${clock(m.endMinute)}（${m.fromDate} 至 ${m.throughDate}）`;
export const localTime = (value: string) => {
  const date = new Date(value);
  return new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 16);
};
export const utcTime = (value: string) =>
  new Date(`${value}:00+08:00`).toISOString();
