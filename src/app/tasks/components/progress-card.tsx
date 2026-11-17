"use client";
import React from "react";
import Link from "next/link";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Productivity } from "./store";

/** Circular progress (goal ring). */
export function Ring({ value, max, size = 64, children }: { value: number; max: number; size?: number; children?: React.ReactNode }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const pct = max ? Math.min(1, value / max) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--viz-track)" strokeWidth={6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={pct >= 1 ? "var(--viz-good)" : "var(--viz-1)"}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function LevelBadge({ level, className }: { level: number; className?: string }) {
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-sm", className)}
      style={{ background: "linear-gradient(135deg, var(--viz-1), #6250d6)" }}
    >
      {level}
    </span>
  );
}

/** Compact card at the top of the tasks sidebar. */
export function ProgressCard({ data, href }: { data: Productivity | undefined; href: string }) {
  if (!data || !data.settings.enabled) return null;
  const { level, today, streak } = data;
  return (
    <Link href={href} className="mx-2.5 mt-2.5 block rounded-xl border bg-background p-3 shadow-sm transition-colors hover:border-foreground/20">
      <div className="flex items-center gap-2.5">
        <LevelBadge level={level.level} className="size-8 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight">{level.name}</p>
          <p className="text-[11px] tabular-nums text-muted-foreground">{data.total.toLocaleString()} pts</p>
        </div>
        <span className={cn("inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums", streak.current ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground")} title={`${streak.current}-day streak`}>
          <Flame className="size-4" />
          {streak.current}
        </span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--viz-track)]">
        <div className="h-full rounded-full bg-[var(--viz-1)] transition-[width] duration-700" style={{ width: `${Math.round(level.progress * 100)}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span>
          Today <span className="font-medium tabular-nums text-foreground">{today.done}</span>/{today.goal}
        </span>
        {level.next && <span className="tabular-nums">{(level.next - data.total).toLocaleString()} to {level.nextName}</span>}
      </div>
    </Link>
  );
}

