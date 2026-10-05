import { describe, expect, it } from "vitest";
import { reconcileDraft } from "./hooks";
import { localTime, utcTime } from "./format";

describe("编辑版本基线", () => {
  it("首次读取建立服务器基线，干净副本接受更高版本", () => {
    expect(reconcileDraft(undefined, { version: 0, value: ["a"] })).toEqual({
      version: 0,
      value: ["a"],
      dirty: false,
    });
    expect(
      reconcileDraft(
        { version: 3, value: ["a"], dirty: false },
        { version: 4, value: ["b"] },
      ),
    ).toEqual({ version: 4, value: ["b"], dirty: false });
  });
  it("更高服务器版本不重标本地 dirty 副本版本、不覆写或合并它", () => {
    const draft = { version: 3, value: ["local-a", "local-b"], dirty: true };
    expect(reconcileDraft(draft, { version: 9, value: ["remote-c"] })).toBe(
      draft,
    );
  });
  it("成功写入后的迟到轮询和同版本不同数据不得回滚已确认副本", () => {
    const accepted = { version: 8, value: ["new"], dirty: false };
    expect(reconcileDraft(accepted, { version: 7, value: ["old"] })).toBe(
      accepted,
    );
    expect(reconcileDraft(accepted, { version: 8, value: ["different"] })).toBe(
      accepted,
    );
  });
});
it("北京时间跨日窗口转换不依赖运行机器时区", () => {
  expect(localTime("2026-10-04T23:45:00Z")).toBe("2026-10-05T07:45");
  expect(utcTime("2026-10-05T00:15")).toBe("2026-10-04T16:15:00.000Z");
});
