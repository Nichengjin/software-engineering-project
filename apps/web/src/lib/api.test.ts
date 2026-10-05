import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, setCsrfToken, write } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(null);
});
const success = (data: unknown) =>
  new Response(
    JSON.stringify({
      data,
      requestId: "test",
      serverTime: "2026-10-04T10:00:00Z",
    }),
  );
describe("同源 cookie 与 CSRF 请求", () => {
  it("GET 保持同源 credentials 且不发送 CSRF；正式提交携带原版本与整份选择", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => success({ schedule: { version: 8 } }));
    vi.stubGlobal("fetch", fetch);
    setCsrfToken("fixture-token");
    await api("/terms");
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/terms");
    const get = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(get.credentials).toBe("include");
    expect((get.headers as Headers).has("X-CSRF-Token")).toBe(false);
    await write("/student/terms/t/schedule/submit", "POST", {
      expectedVersion: 7,
      primaryOfferingIds: ["a", "b"],
      alternateOfferingIds: ["full"],
    });
    const request = fetch.mock.calls[1]?.[1] as RequestInit;
    expect((request.headers as Headers).get("X-CSRF-Token")).toBe(
      "fixture-token",
    );
    expect(JSON.parse(request.body as string)).toEqual({
      expectedVersion: 7,
      primaryOfferingIds: ["a", "b"],
      alternateOfferingIds: ["full"],
    });
  });
  it("登录不带旧 CSRF；multipart 不手工设置 boundary", async () => {
    const fetch = vi.fn().mockImplementation(async () => success({}));
    vi.stubGlobal("fetch", fetch);
    setCsrfToken("old");
    await write("/auth/login", "POST", {
      account: "fixture",
      password: "not-real",
    });
    expect(
      (fetch.mock.calls[0]?.[1].headers as Headers).has("X-CSRF-Token"),
    ).toBe(false);
    const form = new FormData();
    form.append("file", new Blob(["fixture"]), "fixture.xlsx");
    await api("/registrar/imports/students", { method: "POST", body: form });
    const request = fetch.mock.calls[1]?.[1] as RequestInit;
    expect(request.body).toBe(form);
    expect((request.headers as Headers).has("Content-Type")).toBe(false);
    expect((request.headers as Headers).get("X-CSRF-Token")).toBe("old");
  });
  it("版本失败保留 issues、currentVersion 和 requestId，不自动重发", async () => {
    const failure = {
      error: {
        code: "STALE_VERSION",
        message: "课表已变更",
        issues: [{ offeringId: "b", code: "CHANGED", message: "班次删除" }],
        currentVersion: 9,
        retryable: false,
      },
      requestId: "request-conflict",
    };
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(failure), { status: 409 }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      write("/student/terms/t/schedule", "PUT", { expectedVersion: 7 }),
    ).rejects.toMatchObject({ status: 409, failure });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("会话过期通知 AuthProvider，网络故障不冒充成功", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              error: {
                code: "UNAUTHENTICATED",
                message: "会话过期",
                issues: [],
                retryable: false,
              },
              requestId: "expired",
            }),
            { status: 401 },
          ),
        ),
    );
    await expect(api("/terms")).rejects.toBeInstanceOf(ApiError);
    expect(dispatchEvent.mock.calls[0]?.[0].type).toBe("session-expired");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(
      write("/registrar/terms/t/close", "POST", { confirmed: true }),
    ).rejects.toThrow("操作结果未知");
  });
});
