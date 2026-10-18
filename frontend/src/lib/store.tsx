"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { Case, Settings } from "./types";

export type Section =
  | "overview" | "investigations" | "evidence" | "graph" | "timeline"
  | "research" | "reports" | "audit" | "settings";

interface Toast { id: number; kind: "success" | "error" | "info"; msg: string }

interface Store {
  ready: boolean;
  online: boolean;
  settings: Settings | null;
  cases: Case[];
  currentCase: Case | null;
  currentCaseId: string | null;
  section: Section;
  toasts: Toast[];
  setSection: (s: Section) => void;
  selectCase: (id: string | null) => void;
  refreshCases: () => Promise<void>;
  toast: (msg: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<Store | null>(null);

const INVESTIGATION_SECTIONS: Section[] = [
  "evidence", "graph", "timeline", "research", "reports",
];

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null);
  const [section, setSectionState] = useState<Section>("overview");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const refreshCases = useCallback(async () => {
    try {
      setCases(await api.listCases());
    } catch {
      /* offline */
    }
  }, []);

  const toast = useCallback((msg: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const dismissToast = useCallback((id: number) =>
    setToasts((t) => t.filter((x) => x.id !== id)), []);

  useEffect(() => {
    (async () => {
      const savedCase = localStorage.getItem("cw_case");
      const savedSection = localStorage.getItem("cw_section") as Section | null;
      try {
        const [s, c] = await Promise.all([api.settings(), api.listCases()]);
        setSettings(s);
        setCases(c);
        setOnline(true);
        if (savedCase && c.some((x) => x.id === savedCase)) setCurrentCaseId(savedCase);
        else if (savedSection && c[0]) setCurrentCaseId(c[0].id);
        if (savedSection) setSectionState(savedSection);
      } catch {
        setOnline(false);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const selectCase = useCallback((id: string | null) => {
    setCurrentCaseId(id);
    if (id) localStorage.setItem("cw_case", id);
    else localStorage.removeItem("cw_case");
  }, []);

  const setSection = useCallback((s: Section) => {
    setSectionState(s);
    localStorage.setItem("cw_section", s);
  }, []);

  const currentCase = useMemo(
    () => cases.find((c) => c.id === currentCaseId) || null,
    [cases, currentCaseId],
  );

  // if a case-scoped section is open with no case, nudge to overview
  useEffect(() => {
    if (!currentCase && INVESTIGATION_SECTIONS.includes(section)) {
      setSectionState("investigations");
    }
  }, [currentCase, section]);

  const value: Store = {
    ready, online, settings, cases, currentCase, currentCaseId, section, toasts,
    setSection, selectCase, refreshCases, toast, dismissToast,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used within StoreProvider");
  return s;
}
