"use client";

import React from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  from: string;
  subject: string;
  snippet: string;
  outcome: string;
  tone: "brand" | "mint" | "amber" | "muted";
  hue: number;
};

const ROWS: Row[] = [
  {
    from: "Daniel Okafor",
    subject: "Re: Contract redlines",
    snippet: "Legal flagged one clause in section 4.2. Can we talk tomorrow?",
    outcome: "Reply drafted",
    tone: "brand",
    hue: 243,
  },
  {
    from: "Product Hunt Daily",
    subject: "Today's top 10 launches",
    snippet: "The most upvoted products of the day, hand-picked for you.",
    outcome: "Unsubscribed",
    tone: "muted",
    hue: 12,
  },
  {
    from: "Priya Natarajan",
    subject: "Design crit, Thursday 2pm",
    snippet: "Bringing the new onboarding flow. Would love your eyes on it.",
    outcome: "Added to calendar",
    tone: "mint",
    hue: 173,
  },
  {
    from: "Stripe",
    subject: "Your receipt #2041-7781",
    snippet: "Amount paid $49.00. Payment method Visa ending 4242.",
    outcome: "Filed under Finance",
    tone: "muted",
    hue: 262,
  },
  {
    from: "Tom Alvarez",
    subject: "Lunch next week?",
    snippet: "Free Tuesday or Wednesday around noon? New ramen place nearby.",
    outcome: "Snoozed to Monday",
    tone: "amber",
    hue: 32,
  },
];

const START = 1284;
const STEP_MS = 1100;

const toneClass: Record<Row["tone"], string> = {
  brand: "bg-brand text-brand-foreground",
  mint: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  muted: "bg-foreground/[0.06] text-foreground/70",
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/**
 * The hero's one orchestrated moment: an inbox the assistant works through,
 * with the unread count in the headline ticking down to zero alongside it.
 * Plays once; "Replay" restarts it. Reduced-motion users see the end state.
 */
export function HeroInbox({
  onCount,
}: {
  onCount?: (n: number) => void;
}) {
  const reduced = usePrefersReducedMotion();
  // step = number of rows already handled
  const [step, setStep] = React.useState(0);
  const [run, setRun] = React.useState(0);

  React.useEffect(() => {
    if (reduced) {
      setStep(ROWS.length);
      return;
    }
    setStep(0);
    const timers: number[] = [];
    ROWS.forEach((_, i) => {
      timers.push(window.setTimeout(() => setStep(i + 1), 900 + i * STEP_MS));
    });
    return () => timers.forEach(clearTimeout);
  }, [run, reduced]);

  // Count down smoothly toward the value for the current step.
  const target = Math.round(START * (1 - step / ROWS.length));
  const [shown, setShown] = React.useState(START);
  React.useEffect(() => {
    if (reduced) {
      setShown(target);
      return;
    }
    let raf = 0;
    const from = shown;
    const t0 = performance.now();
    const dur = STEP_MS * 0.85;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduced]);

  React.useEffect(() => onCount?.(shown), [shown, onCount]);

  const done = step >= ROWS.length;

  // Soft light that follows the pointer across the window (skipped for reduced motion).
  const windowRef = React.useRef<HTMLDivElement>(null);
  const onPointerMove = (e: React.PointerEvent) => {
    if (reduced || !windowRef.current) return;
    const r = windowRef.current.getBoundingClientRect();
    windowRef.current.style.setProperty("--mx", `${e.clientX - r.left}px`);
    windowRef.current.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <div className="relative">
      {/* Window */}
      <div
        ref={windowRef}
        onPointerMove={onPointerMove}
        className="group/window relative overflow-hidden rounded-[22px] border border-foreground/10 bg-background shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_30px_80px_-30px_rgba(40,36,120,0.35),0_12px_24px_-12px_rgba(0,0,0,0.12)] dark:shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-300 group-hover/window:opacity-100"
          style={{ background: "radial-gradient(260px circle at var(--mx, 50%) var(--my, 30%), hsl(var(--brand) / 0.09), transparent 70%)" }}
        />
        <div className="flex h-11 items-center gap-2 border-b border-foreground/[0.07] bg-sidebar px-4">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="ml-3 text-[12px] font-medium text-foreground/70">
            Inbox
          </span>
          <span className="ml-auto rounded-md bg-brand-soft px-1.5 text-[11px] font-medium tabular-nums text-brand">
            {shown.toLocaleString("en-US")}
          </span>
        </div>

        <ul className="relative min-h-[392px] divide-y divide-foreground/[0.06]">
          {ROWS.map((row, i) => {
            const handled = i < step;
            const active = i === step && !done;
            return (
              <li
                key={row.subject}
                className={cn(
                  "relative flex gap-3 px-4 py-3.5 transition-[background-color,opacity] duration-500",
                  active && "bg-brand-soft/70",
                  handled && "opacity-55",
                )}
              >
                {active && (
                  <span className="absolute inset-y-3 left-0 w-[3px] rounded-full bg-brand" />
                )}
                <span
                  className="sender-avatar mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1 ring-inset ring-black/5 dark:ring-white/10"
                  style={{ ["--h" as string]: row.hue }}
                  aria-hidden
                >
                  {row.from
                    .split(" ")
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "truncate text-[13px]",
                        handled ? "font-medium" : "font-semibold",
                      )}
                    >
                      {row.from}
                    </span>
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-all duration-500",
                        toneClass[row.tone],
                        handled
                          ? "translate-x-0 opacity-100"
                          : "pointer-events-none translate-x-2 opacity-0",
                      )}
                    >
                      {row.outcome}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-0.5 truncate text-[13px]",
                      handled && "line-through decoration-foreground/25",
                    )}
                  >
                    {row.subject}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {row.snippet}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Ask bar */}
        <div className="border-t border-foreground/[0.07] bg-sidebar/70 p-3">
          <div className="flex items-center gap-2 rounded-full border border-foreground/10 bg-background px-3.5 py-2 text-[13px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-brand" />
            {done
              ? "All caught up. Ask anything about your email."
              : "Working through your inbox…"}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setRun((r) => r + 1)}
        className={cn(
          "absolute -bottom-11 right-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-opacity hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          done && !reduced ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        tabIndex={done && !reduced ? 0 : -1}
      >
        <RotateCcw className="size-3.5" />
        Replay
      </button>
    </div>
  );
}
