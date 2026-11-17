"use client";
import React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

/* Charts for the procurement dashboard. Colours come from the --viz-* tokens
   in globals.css (validated for colour-blind separation and contrast). Text
   always uses text tokens; colour sits only on marks and swatches. */

/** "opportunity" → "opportunities"; "new opportunity" → "new opportunities". */
const plural = (unit: string, n: number) => (n === 1 ? unit : unit.endsWith("y") ? `${unit.slice(0, -1)}ies` : `${unit}s`);

const tickStyle = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: { value: number }[]; label?: string; unit: string }) {
  if (!active || !payload?.length) return null;
  const v = payload[0]!.value;
  return (
    <div className="whitespace-nowrap rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums text-foreground">
        {v.toLocaleString()} {plural(unit, v)}
      </p>
    </div>
  );
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

/** 30-day discoveries: single series area (2px line, 10% wash), crosshair tooltip. */
export function DiscoveryTrend({ data }: { data: { date: string; count: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: shortDate(d.date) }));
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="h-44 w-full" role="img" aria-label={`Opportunities discovered per day over the last 30 days. Peak ${max}.`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-1)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--viz-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="label" tick={tickStyle} tickLine={false} axisLine={false} interval={6} minTickGap={12} />
          <YAxis allowDecimals={false} tick={tickStyle} tickLine={false} axisLine={false} width={40} domain={[0, Math.max(4, max)]} />
          <Tooltip content={<ChartTooltip unit="new opportunity" />} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--viz-1)"
            strokeWidth={2}
            fill="url(#trendFill)"
            activeDot={{ r: 4, fill: "var(--viz-1)", stroke: "hsl(var(--card))", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Fit-score distribution: columns ≤24px, rounded data-end, tooltip per column. */
export function FitHistogram({ data }: { data: { label: string; count: number }[] }) {
  return (
    <div className="h-40 w-full" role="img" aria-label={`Fit scores: ${data.map((d) => `${d.label}: ${d.count}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="label" tick={tickStyle} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={tickStyle} tickLine={false} axisLine={false} width={40} />
          <Tooltip content={<ChartTooltip unit="opportunity" />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }} />
          <Bar dataKey="count" fill="var(--viz-1)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Hover tooltip for HTML marks (bars and segments that aren't recharts). */
function useHover() {
  const [tip, setTip] = React.useState<{ x: number; y: number; text: React.ReactNode } | null>(null);
  const bind = (text: React.ReactNode) => ({
    onMouseMove: (e: React.MouseEvent) => {
      const box = (e.currentTarget as HTMLElement).closest("[data-hover-root]")!.getBoundingClientRect();
      // Keep the tooltip inside the chart so it never widens the page.
      const x = Math.min(Math.max(e.clientX - box.left, 90), Math.max(90, box.width - 90));
      setTip({ x, y: e.clientY - box.top, text });
    },
    onMouseLeave: () => setTip(null),
  });
  const node = tip ? (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md"
      style={{ left: tip.x, top: tip.y - 10 }}
    >
      {tip.text}
    </div>
  ) : null;
  return { bind, node };
}

/** Pipeline funnel: horizontal bars on one baseline, ordinal blue ramp, value at the tip. */
export function PipelineFunnel({ stages }: { stages: { key: string; label: string; count: number }[] }) {
  const { bind, node } = useHover();
  const max = Math.max(1, ...stages.map((s) => s.count));
  const ramp = ["--viz-ramp-1", "--viz-ramp-2", "--viz-ramp-3", "--viz-ramp-4", "--viz-ramp-5", "--viz-ramp-6"];
  return (
    <div className="relative space-y-2.5" data-hover-root>
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1]!.count : null;
        return (
          <div key={s.key} className="grid grid-cols-[7rem_1fr] items-center gap-3 sm:grid-cols-[8rem_1fr]">
            <span className="truncate text-xs text-muted-foreground">{s.label}</span>
            <div className="flex items-center gap-2" {...bind(
              <>
                <span className="font-medium text-foreground">{s.label}</span>
                <span className="ml-2 tabular-nums">{s.count.toLocaleString()}</span>
                {prev ? <span className="ml-2 text-muted-foreground">{Math.round((s.count / prev) * 100)}% of previous stage</span> : null}
              </>,
            )}>
              <div className="h-5 min-w-0 flex-1">
                <div
                  className="h-full rounded-r-[4px] transition-[width] duration-500"
                  style={{ width: s.count ? `max(${(s.count / max) * 100}%, 4px)` : 0, background: `var(${ramp[i] ?? ramp[ramp.length - 1]})` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums">{s.count.toLocaleString()}</span>
            </div>
          </div>
        );
      })}
      {node}
    </div>
  );
}

/** Label ink inside a block: white, near-black, or "auto" (near-black in light mode, white in dark) for neutral/aqua blocks. */
export type Segment = { key: string; label: string; value: number; color: string; ink: "light" | "dark" | "auto" };

/** Tall segmented bar (one whole split into parts) with a legend in block order. */
export function SegmentedBar({ segments, unit = "opportunity", thin = false }: { segments: Segment[]; unit?: string; thin?: boolean }) {
  const { bind, node } = useHover();
  const total = segments.reduce((n, s) => n + s.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div>
      <div className="relative" data-hover-root>
        <div
          className={cn("flex w-full gap-[2px] overflow-hidden", thin ? "h-2 rounded-full" : "h-7 rounded-[4px]")}
          role="img"
          aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}
        >
          {total === 0 ? (
            <div className="h-full w-full rounded-[inherit] bg-[var(--viz-track)]" />
          ) : (
            shown.map((s) => {
              const pct = (s.value / total) * 100;
              return (
                <div
                  key={s.key}
                  className={cn("flex h-full items-center overflow-hidden first:rounded-l-[4px] last:rounded-r-[4px]", thin && "first:rounded-l-full last:rounded-r-full")}
                  style={{ width: `${pct}%`, background: s.color }}
                  {...bind(
                    <>
                      <span className="font-medium text-foreground">{s.label}</span>
                      <span className="ml-2 tabular-nums">
                        {s.value.toLocaleString()} {plural(unit, s.value)} · {Math.round(pct)}%
                      </span>
                    </>,
                  )}
                >
                  {!thin && pct >= 12 && (
                    <span className={cn("px-2 text-[11px] font-semibold tabular-nums", s.ink === "light" ? "text-white" : s.ink === "dark" ? "text-zinc-900" : "text-zinc-900 dark:text-white")}>{Math.round(pct)}%</span>
                  )}
                </div>
              );
            })
          )}
        </div>
        {node}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-xs">
            <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-medium tabular-nums">{s.value.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Meter: fill on a lighter track of the same ramp; severity by share. */
export function Meter({ value, total, label, detail }: { value: number; total: number; label: string; detail?: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  const color = total === 0 ? "var(--viz-neutral)" : pct >= 80 ? "var(--viz-1)" : pct >= 50 ? "var(--viz-warning)" : "var(--viz-critical)";
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{total ? `${value} of ${total}` : "None yet"}</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--viz-track)]"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total || 1}
        aria-valuenow={value}
      >
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      {detail && <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  );
}

/** Compact fit meter for table rows. */
export function FitBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground">–</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--viz-track)]">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: "var(--viz-1)" }} />
      </div>
      <span className="w-7 text-right text-xs font-semibold tabular-nums">{score}</span>
    </div>
  );
}
