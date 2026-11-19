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
/** Sidebar streak card, styled like the one in the homepage product window. */
export function ProgressCard({ data, href }: { data: Productivity | undefined; href: string }) {
  if (!data || !data.settings.enabled) return null;
  const { level, today, streak } = data;
  const pct = Math.min(100, Math.round((today.done / Math.max(1, today.goal)) * 100));
  return (
    <Link href={href} className="mx-2.5 mt-2.5 block rounded-xl bg-muted p-3 transition-colors hover:bg-muted/70">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold">
        <Flame className={cn("size-4", streak.current ? "text-orange-500" : "text-muted-foreground")} />
        {streak.current}-day streak
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <LevelBadge level={level.level} className="size-4 text-[9px]" />
          {level.name}
        </span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
        <div className="h-full rounded-full bg-foreground transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span>
          <span className="font-medium tabular-nums text-foreground">{today.done}</span> of {today.goal} done today
        </span>
        <span className="tabular-nums">{data.total.toLocaleString()} pts</span>
      </p>
    </Link>
  );
}

