"use client";
import React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ELIGIBILITY_LABELS,
  RECOMMENDATION_LABELS,
  STATUS_LABELS,
  type OpportunityStatusId,
} from "@/server/procurement/types";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, description, children, actions, className }: { title: string; description?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card", className)}>
      <div className="flex items-start justify-between gap-3 border-b px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

const pill = "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap";

const STATUS_TONE: Partial<Record<OpportunityStatusId, string>> = {
  discovered: "bg-muted text-muted-foreground ring-border",
  under_review: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300",
  qualified: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
  approved_to_pursue: "bg-brand-soft text-brand ring-brand/20",
  proposal_in_progress: "bg-brand-soft text-brand ring-brand/20",
  submitted: "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300",
  awarded: "bg-emerald-600/15 text-emerald-800 ring-emerald-600/25 dark:text-emerald-200",
  unsuccessful: "bg-muted text-muted-foreground ring-border",
  declined: "bg-muted text-muted-foreground ring-border",
  withdrawn: "bg-muted text-muted-foreground ring-border",
};

export function StatusBadge({ status }: { status: OpportunityStatusId }) {
  return <span className={cn(pill, STATUS_TONE[status] ?? "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300")}>{STATUS_LABELS[status]}</span>;
}

export function EligibilityBadge({ value }: { value: keyof typeof ELIGIBILITY_LABELS | null }) {
  if (!value) return <span className={cn(pill, "bg-muted text-muted-foreground ring-border")}>Not assessed</span>;
  const tone = {
    qualified: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
    potentially_qualified: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300",
    requires_clarification: "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300",
    not_qualified: "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300",
  }[value];
  return <span className={cn(pill, tone)}>{ELIGIBILITY_LABELS[value]}</span>;
}

export function RecommendationBadge({ value }: { value: keyof typeof RECOMMENDATION_LABELS | null }) {
  if (!value) return null;
  const tone = {
    strongly_recommend: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
    consider: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300",
    do_not_pursue: "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300",
  }[value];
  return <span className={cn(pill, tone)}>{RECOMMENDATION_LABELS[value]}</span>;
}

export function FitScore({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground">–</span>;
  const tone = score >= 75 ? "text-emerald-600 dark:text-emerald-400" : score >= 50 ? "text-sky-600 dark:text-sky-400" : "text-rose-600 dark:text-rose-400";
  return <span className={cn("text-sm font-semibold tabular-nums", tone)}>{score}</span>;
}

export function VerificationBadge({ status }: { status: "unverified" | "verified" | "expired" | "rejected" }) {
  const tone = {
    verified: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
    unverified: "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300",
    expired: "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300",
    rejected: "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300",
  }[status];
  return <span className={cn(pill, tone)}>{status[0]!.toUpperCase() + status.slice(1)}</span>;
}

export function formatDate(d: Date | string | null | undefined, withTime = false) {
  if (!d) return "–";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

/** "in 5 days", "2 days ago", "today". */
export function relativeDays(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const days = Math.round((date.getTime() - Date.now()) / 86400_000);
  if (days === 0) return "today";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  return `${-days} day${days === -1 ? "" : "s"} ago`;
}

export function money(value: number | null | undefined, currency = "USD") {
  if (value === null || value === undefined) return "–";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return value.toLocaleString();
  }
}

export const inputClass =
  "h-9 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Editable list of short values (keywords, codes…). Enter or comma adds. */
export function ChipsInput({ value, onChange, placeholder, disabled }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; disabled?: boolean }) {
  const [draft, setDraft] = React.useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange(Array.from(new Set([...value, ...parts])));
    setDraft("");
  };
  return (
    <div className={cn("flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 shadow-sm", disabled && "opacity-60")}>
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
          {v}
          {!disabled && (
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="text-muted-foreground hover:text-foreground">
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      <input
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => add(draft)}
        placeholder={value.length ? "" : placeholder}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1.5 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
