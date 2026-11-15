import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PracticeType } from "./yoga-api";

const Context = createContext<{ practice: PracticeType; setPractice: (p: PracticeType) => void } | null>(null);
export function PracticeProvider({ children }: { children: ReactNode }) {
  const [practice, setPracticeState] = useState<PracticeType>("yoga");
  useEffect(() => {
    try { if (localStorage.getItem("vona.practice.v1") === "stretching") setPracticeState("stretching"); } catch { /* keep default */ }
  }, []);
  function setPractice(p: PracticeType) {
    setPracticeState(p);
    try { localStorage.setItem("vona.practice.v1", p); } catch { /* retain in memory */ }
  }
  return <Context.Provider value={{ practice, setPractice }}>{children}</Context.Provider>;
}
export function usePractice() {
  const context = useContext(Context);
  if (!context) throw new Error("Practice provider is missing");
  return context;
}