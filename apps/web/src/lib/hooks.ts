import { useCallback, useEffect, useRef, useState } from "react";
import { message } from "./api";

// Serial polling: one request batch in flight, aborted on unmount, immediate refresh on visibility.
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  interval = 0,
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number>();
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  useEffect(() => {
    let disposed = false;
    let active = false;
    let again = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    setData(undefined);
    setError(undefined);
    setLoading(true);
    setUpdatedAt(undefined);
    const run = async () => {
      if (disposed) return;
      if (active) {
        again = true;
        return;
      }
      if (timer) clearTimeout(timer);
      active = true;
      const startedAt = Date.now();
      controller = new AbortController();
      try {
        const result = await load(controller.signal);
        if (!disposed) {
          setData(result);
          setError(undefined);
          setUpdatedAt(Date.now());
        }
      } catch (cause) {
        controller.abort();
        if (!disposed) setError(message(cause));
      } finally {
        active = false;
        if (!disposed) {
          setLoading(false);
          if (again) {
            again = false;
            void run();
          } else if (interval && !document.hidden)
            timer = setTimeout(
              () => void run(),
              Math.max(0, interval - (Date.now() - startedAt)),
            );
        }
      }
    };
    const visible = () => {
      if (!document.hidden) void run();
    };
    refreshRef.current = () => {
      void run();
    };
    document.addEventListener("visibilitychange", visible);
    void run();
    return () => {
      disposed = true;
      controller?.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [load, interval]);
  return { data, error, loading, updatedAt, refresh };
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [success, setSuccess] = useState("");
  const inFlight = useRef(false);
  async function run(task: () => Promise<void>, done = "操作已完成。") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    setSuccess("");
    try {
      await task();
      setSuccess(done);
    } catch (cause) {
      setError(cause);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return {
    busy,
    error,
    success,
    run,
    clear: () => {
      setError(undefined);
      setSuccess("");
    },
  };
}

type Draft<T> = { version: number; value: T; dirty: boolean };
export function reconcileDraft<T>(
  current: Draft<T> | undefined,
  server: { version: number; value: T },
): Draft<T> {
  // A poll started before a successful mutation must not roll the acknowledged version back.
  return current && (current.dirty || current.version >= server.version)
    ? current
    : { ...server, dirty: false };
}

export function useVersionedDraft<T>(
  server: { version: number; value: T } | undefined,
) {
  const [draft, setDraft] = useState<Draft<T>>();
  useEffect(() => {
    if (server) setDraft((current) => reconcileDraft(current, server));
  }, [server]);
  useEffect(() => {
    if (!draft?.dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [draft?.dirty]);
  const change = (value: T) =>
    setDraft((current) =>
      current ? { ...current, value, dirty: true } : undefined,
    );
  const adopt = () => {
    if (server) setDraft({ ...server, dirty: false });
  };
  const accept = (version: number, value: T) =>
    setDraft({ version, value, dirty: false });
  return {
    draft,
    change,
    adopt,
    accept,
    stale: !!server && !!draft && server.version > draft.version,
  };
}
