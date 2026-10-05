import type { Failure, Success } from "@wylie/contracts";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly failure: Failure,
  ) {
    super(failure.error.message);
  }
}

let csrfToken: string | null = null;
export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (method !== "GET" && path !== "/auth/login" && csrfToken)
    headers.set("X-CSRF-Token", csrfToken);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error(
      "无法连接服务器。请检查网络；操作结果未知时先刷新查询，不要重复提交。",
    );
  }
  let body: Success<T> | Failure;
  try {
    body = (await response.json()) as Success<T> | Failure;
  } catch {
    throw new Error("服务器响应无法解析，请稍后刷新查询。");
  }
  if (!response.ok) {
    const failure = body as Failure;
    if (
      response.status === 401 &&
      path !== "/auth/login" &&
      path !== "/auth/me"
    ) {
      window.dispatchEvent(new Event("session-expired"));
    }
    if (failure.error?.code === "PASSWORD_CHANGE_REQUIRED")
      window.dispatchEvent(new Event("password-required"));
    throw new ApiError(response.status, failure);
  }
  return (body as Success<T>).data;
}

export function write<T>(path: string, method: string, body: unknown) {
  return api<T>(path, { method, body: JSON.stringify(body) });
}

export function message(error: unknown) {
  return error instanceof Error ? error.message : "操作未完成，请稍后重试。";
}

export const idPath = (id: string) => encodeURIComponent(id);
