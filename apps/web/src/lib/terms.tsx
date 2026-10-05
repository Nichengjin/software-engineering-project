import { createContext, useCallback, useContext } from "react";
import type { ReactNode } from "react";
import type { Term } from "@wylie/contracts";
import { api } from "./api";
import { useResource } from "./hooks";

export type TermList = {
  terms: Term[];
  currentTermId: string;
  previousCompletedTermId: string | null;
  launchTermId: string;
};
const TermContext = createContext<ReturnType<typeof useTermResource> | null>(
  null,
);
function useTermResource() {
  const load = useCallback(
    (signal: AbortSignal) => api<TermList>("/terms", { signal }),
    [],
  );
  return useResource(load, 1000);
}
export function TermsProvider({ children }: { children: ReactNode }) {
  const resource = useTermResource();
  return (
    <TermContext.Provider value={resource}>{children}</TermContext.Provider>
  );
}
export function useTerms() {
  const value = useContext(TermContext);
  if (!value) throw new Error("TermsProvider is required");
  return value;
}
export function useCurrentTerm() {
  const { data } = useTerms();
  return data?.terms.find((term) => term.id === data.currentTermId);
}
