"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { CountUp, LiveBadge } from "@/components/live";

/** Gradient themes for page banners (white text stays readable on all of them). */
export const BANNER_TONES = {
  indigo: "linear-gradient(120deg, #312e81 0%, #4f46e5 40%, #7c3aed 72%, #0ea5e9 100%)",
  violet: "linear-gradient(120deg, #4c1d95 0%, #7c3aed 45%, #c026d3 100%)",
  ocean: "linear-gradient(120deg, #0c4a6e 0%, #0284c7 45%, #06b6d4 100%)",
  emerald: "linear-gradient(120deg, #064e3b 0%, #059669 48%, #14b8a6 100%)",
  sunset: "linear-gradient(120deg, #7c2d12 0%, #ea580c 45%, #db2777 100%)",
  rose: "linear-gradient(120deg, #881337 0%, #e11d48 50%, #f97316 100%)",
  slate: "linear-gradient(120deg, #0f172a 0%, #334155 55%, #475569 100%)",
} as const;
export type BannerTone = keyof typeof BANNER_TONES;

export type BannerStat = { label: string; value: number | string; format?: (n: number) => string };

/**
 * Colourful page header: gradient, soft glows, optional LIVE badge, stat
 * chips (numbers count up) and actions. Used across procurement and tasks.
 */
export function PageBanner({
  eyebrow,
  title,
  description,
  icon: Icon,
  tone = "indigo",
  live,
  stats,
  actions,
  className,
  children,
  wrapTitle,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ElementType;
  tone?: BannerTone;
  live?: { updatedAt: number; refreshing?: boolean } | null;
  stats?: BannerStat[];
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  /** Let long titles wrap instead of truncating. */
  wrapTitle?: boolean;
}) {
  return (
    <section className={cn("relative mb-6 overflow-hidden rounded-3xl p-5 text-white shadow-lg sm:p-6", className)} style={{ background: BANNER_TONES[tone] }}>
      <div className="pointer-events-none absolute -right-16 -top-20 size-60 rounded-full bg-white/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 left-1/4 size-60 rounded-full bg-black/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" aria-hidden />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {(live || eyebrow) && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {live && <LiveBadge updatedAt={live.updatedAt} refreshing={live.refreshing} />}
              {eyebrow && <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/75">{eyebrow}</span>}
            </div>
          )}
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight sm:text-3xl">
            {Icon && (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/25">
                <Icon className="size-5" />
              </span>
            )}
            <span className={cn("min-w-0", wrapTitle ? "text-balance text-xl leading-snug sm:text-2xl" : "truncate")}>{title}</span>
          </h1>
          {description && <p className="mt-2 max-w-2xl text-sm text-white/80">{description}</p>}
          {children}
        </div>
        {(stats?.length || actions) && (
          <div className="flex shrink-0 flex-col gap-3 lg:items-end">
            {stats && stats.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {stats.map((s) => (
                  <div key={s.label} className="min-w-[5.5rem] rounded-2xl bg-white/12 px-3 py-2 ring-1 ring-inset ring-white/20 backdrop-blur" style={{ background: "rgba(255,255,255,0.12)" }}>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-white/70">{s.label}</p>
                    <p className="text-xl font-semibold leading-tight">{typeof s.value === "number" ? <CountUp value={s.value} format={s.format} /> : s.value}</p>
                  </div>
                ))}
              </div>
            )}
            {/* Light buttons (outline variant) inherit the banner's white text; give them dark text back. */}
            {actions && <div className="flex flex-wrap gap-2 text-foreground [&_.bg-background]:text-foreground [&_a]:shadow-sm [&_button]:shadow-sm">{actions}</div>}
          </div>
        )}
      </div>
    </section>
  );
}
