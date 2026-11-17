"use client";
import React from "react";
import { cn } from "@/lib/utils";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Number that counts from its previous value to the new one (instant with reduced motion). */
export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString(), duration = 700 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const [shown, setShown] = React.useState(value);
  const from = React.useRef(value);
  React.useEffect(() => {
    if (reducedMotion() || from.current === value) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(a + (value - a) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className="tabular-nums">{format(shown)}</span>;
}

/** Re-renders every `ms` so relative times stay current. */
export function useNow(ms = 1000) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Pulsing "Live" pill with how long ago the data refreshed. */
export function LiveBadge({ updatedAt, refreshing, className }: { updatedAt: number; refreshing?: boolean; className?: string }) {
  const now = useNow(1000);
  const secs = Math.max(0, Math.round((now - updatedAt) / 1000));
  const ago = secs < 5 ? "just now" : secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)}m ago`;
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white ring-1 ring-inset ring-white/25 backdrop-blur", className)}>
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-75 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-300" />
      </span>
      LIVE
      <span className="font-normal text-white/75">{refreshing ? "refreshing…" : `updated ${ago}`}</span>
    </span>
  );
}

/** Ids that appeared since the first render (for highlighting new feed items). */
export function useNewIds(ids: string[]) {
  const seen = React.useRef<Set<string> | null>(null);
  const [fresh, setFresh] = React.useState<Set<string>>(new Set());
  const key = ids.join(",");
  React.useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(ids);
      return;
    }
    const added = ids.filter((id) => !seen.current!.has(id));
    added.forEach((id) => seen.current!.add(id));
    if (added.length) {
      setFresh(new Set(added));
      const t = setTimeout(() => setFresh(new Set()), 6000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return fresh;
}
