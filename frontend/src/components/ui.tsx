"use client";

import { useEffect, useState } from "react";
import type { Status } from "@/lib/types";

/* ---------------------------------- Card --------------------------------- */
export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border bg-[var(--bg-elev)] ${className}`}>{children}</div>
  );
}

export function CardHeader({ title, subtitle, action }: {
  title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--border-soft)] px-5 py-4">
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-[var(--fg-muted)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* --------------------------------- Button -------------------------------- */
type BtnVariant = "primary" | "ghost" | "outline" | "danger" | "subtle";
export function Button({
  variant = "outline", size = "md", className = "", loading, disabled, children, ...rest
}: {
  variant?: BtnVariant; size?: "sm" | "md"; loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm: "text-[13px] px-2.5 py-1.5", md: "text-[14px] px-3.5 py-2" };
  const variants: Record<BtnVariant, string> = {
    primary: "bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[#5cc8fa]",
    outline: "border border-[var(--border)] bg-[var(--bg-elev-2)] text-[var(--fg)] hover:bg-[#1c2537]",
    ghost: "text-[var(--fg-muted)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg)]",
    danger: "border border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)] hover:bg-[var(--danger)]/20",
    subtle: "bg-[var(--bg-elev-2)] text-[var(--fg)] hover:bg-[#1c2537]",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={disabled || loading} {...rest}>
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

/* --------------------------------- Badges -------------------------------- */
const STATUS_COLOR: Record<string, string> = {
  pending: "#5c6880", running: "#60a5fa", completed: "#34d399",
  needs_review: "#fbbf24", failed: "#f87171", skipped: "#8a97b0",
  draft: "#8a97b0", approved: "#34d399", accepted: "#34d399",
  rejected: "#f87171", unreviewed: "#5c6880", corrected: "#2dd4bf",
  processing: "#60a5fa", ready: "#34d399",
};
const STATUS_LABEL: Record<string, string> = {
  needs_review: "needs review",
};
export function Badge({ status, children }: { status?: string; children?: React.ReactNode }) {
  const key = status || String(children);
  const color = STATUS_COLOR[key] || "#8a97b0";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular"
      style={{ borderColor: `${color}55`, color, background: `${color}14` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {(STATUS_LABEL[key] || key).replace(/_/g, " ")}
    </span>
  );
}

export function Tag({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "info" | "warn" | "danger" | "ok" | "accent" }) {
  const tones = {
    default: "border-[var(--border)] text-[var(--fg-muted)]",
    info: "border-[var(--info)]/40 text-[var(--info)] bg-[var(--info)]/10",
    warn: "border-[var(--warn)]/40 text-[var(--warn)] bg-[var(--warn)]/10",
    danger: "border-[var(--danger)]/40 text-[var(--danger)] bg-[var(--danger)]/10",
    ok: "border-[var(--ok)]/40 text-[var(--ok)] bg-[var(--ok)]/10",
    accent: "border-[var(--accent)]/40 text-[var(--accent)] bg-[var(--accent)]/10",
  };
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

/* --------------------------------- Inputs -------------------------------- */
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props}
    className={`w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-[14px] text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--accent)]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 ${props.className || ""}`} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props}
    className={`w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-[14px] text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--accent)]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 ${props.className || ""}`} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props}
    className={`w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2 text-[14px] text-[var(--fg)] focus:border-[var(--accent)]/60 focus:outline-none ${props.className || ""}`} />;
}
export function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-[var(--fg-muted)]">
        {label}{required && <span className="text-[var(--danger)]">*</span>}
      </div>
      {children}
      {hint && <p className="mt-1 text-[12px] text-[var(--fg-dim)]">{hint}</p>}
    </label>
  );
}

/* ------------------------------- Spinner/Bar ----------------------------- */
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size }} />
  );
}
export function ProgressBar({ value, tone = "var(--accent)" }: { value: number; tone?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-elev-2)]">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: tone }} />
    </div>
  );
}

/* --------------------------------- Modal --------------------------------- */
export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: React.ReactNode;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${wide ? "max-w-3xl" : "max-w-lg"} fade-in rounded-xl border bg-[var(--bg-elev)] shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-5 py-3.5">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <button onClick={onClose} className="text-[var(--fg-muted)] hover:text-[var(--fg)]" aria-label="Close">✕</button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-[var(--border-soft)] px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------ Confirm dialog --------------------------- */
export function ConfirmDialog({ open, onCancel, onConfirm, title, message, confirmLabel = "Confirm", danger }: {
  open: boolean; onCancel: () => void; onConfirm: () => void;
  title: string; message: React.ReactNode; confirmLabel?: string; danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}
      footer={<>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
      </>}>
      <div className="text-[14px] text-[var(--fg-muted)]">{message}</div>
    </Modal>
  );
}

/* ------------------------------- Empty state ----------------------------- */
export function EmptyState({ icon, title, message, action }: {
  icon?: React.ReactNode; title: string; message: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] px-6 py-16 text-center">
      {icon && <div className="mb-3 text-[var(--fg-dim)]">{icon}</div>}
      <h3 className="text-[15px] font-semibold text-[var(--fg)]">{title}</h3>
      <p className="mt-1 max-w-md text-[13px] text-[var(--fg-muted)]">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* --------------------------------- Tabs ---------------------------------- */
export function Tabs({ tabs, active, onChange }: {
  tabs: { id: string; label: React.ReactNode }[]; active: string; onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-[var(--border-soft)]">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
            active === t.id
              ? "border-[var(--accent)] text-[var(--fg)]"
              : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------- Tooltip --------------------------------- */
export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border bg-[var(--bg-elev-2)] px-2 py-1 text-[11px] text-[var(--fg-muted)] shadow-lg">
          {label}
        </span>
      )}
    </span>
  );
}

/* ------------------------------ Status helpers --------------------------- */
export function statusTone(s: Status | string): "info" | "ok" | "warn" | "danger" | "default" {
  if (s === "completed" || s === "approved" || s === "accepted") return "ok";
  if (s === "running" || s === "processing") return "info";
  if (s === "needs_review") return "warn";
  if (s === "failed") return "danger";
  return "default";
}
