import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Auth } from "@wylie/contracts";
import { ApiError, api, setCsrfToken } from "./api";

const AuthContext = createContext<{
  auth: Auth | null;
  loading: boolean;
  error: unknown;
  setAuth: (auth: Auth | null) => void;
  reload: () => void;
} | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, updateAuth] = useState<Auth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const setAuth = useCallback((value: Auth | null) => {
    setCsrfToken(value?.csrfToken ?? null);
    updateAuth(value);
  }, []);
  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    void api<Auth>("/auth/me")
      .then(setAuth)
      .catch((cause) => {
        setAuth(null);
        if (!(cause instanceof ApiError && cause.status === 401))
          setError(cause);
      })
      .finally(() => setLoading(false));
  }, [setAuth]);
  useEffect(() => {
    reload();
    const expired = () => {
      setAuth(null);
    };
    window.addEventListener("session-expired", expired);
    window.addEventListener("password-required", reload);
    return () => {
      window.removeEventListener("session-expired", expired);
      window.removeEventListener("password-required", reload);
    };
  }, [reload, setAuth]);
  return (
    <AuthContext.Provider value={{ auth, loading, error, setAuth, reload }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is required");
  return context;
}
