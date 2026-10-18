"use client";

import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { useStore } from "@/lib/store";

const ICONS = {
  success: <CheckCircle2 size={16} className="text-[var(--ok)]" />,
  error: <XCircle size={16} className="text-[var(--danger)]" />,
  info: <Info size={16} className="text-[var(--info)]" />,
};

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id}
          className="fade-in flex items-start gap-2.5 rounded-lg border bg-[var(--bg-elev)] px-3.5 py-2.5 shadow-xl">
          <span className="mt-0.5">{ICONS[t.kind]}</span>
          <span className="flex-1 text-[13px] text-[var(--fg)]">{t.msg}</span>
          <button onClick={() => dismissToast(t.id)} className="text-[var(--fg-dim)] hover:text-[var(--fg)]">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
