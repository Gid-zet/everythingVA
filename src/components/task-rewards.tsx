"use client";
import React from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import type { Reward } from "@/server/tasks/rewards";

/**
 * Celebrations for completed tasks, app-wide (tasks page, calendar panel,
 * anywhere a task is completed). Completion code calls `emitReward`; this
 * listener shows the points, goal/streak bonuses, level-ups and badges, and
 * fires confetti for the big moments. Off when the user turns gamification off.
 */
const EVENT = "task-reward";

export function emitReward(reward: Reward | null | undefined) {
  if (reward && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: reward }));
}

const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6"];

function Confetti({ onDone }: { onDone: () => void }) {
  React.useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);
  const pieces = React.useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.6 + Math.random() * 1.1,
        rotate: Math.random() * 360,
        drift: (Math.random() - 0.5) * 160,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 6,
      })),
    [],
  );
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece absolute top-[-12px] block rounded-[2px]"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.45,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--drift": `${p.drift}px`,
              "--spin": `${p.rotate + 540}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>,
    document.body,
  );
}

export function TaskRewards() {
  const utils = api.useUtils();
  const [confetti, setConfetti] = React.useState(0);
  React.useEffect(() => {
    const onReward = (e: Event) => {
      const r = (e as CustomEvent<Reward>).detail;
      void utils.tasks.productivity.invalidate();
      if (!r.enabled) return;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const big = r.levelUp || r.bonuses.some((b) => b.label.startsWith("Daily goal") || b.label === "Weekly goal");
      if (big && !reduced) setConfetti((n) => n + 1);

      // One toast for the points (bonuses folded in), separate ones for milestones.
      const bonus = r.bonuses.reduce((n, x) => n + x.points, 0);
      const lines = r.bonuses.length
        ? r.bonuses.map((x) => `${x.label} +${x.points}`)
        : [r.goal.reached ? `Daily goal reached${r.streak > 1 ? ` · ${r.streak}-day streak` : ""}` : `${r.goal.done} of ${r.goal.target} for today`];
      (bonus ? toast.success : toast)(`+${r.points + bonus} points`, { description: lines.join(" · "), duration: bonus ? 5000 : 2500 });
      if (r.levelUp) toast.success(`Level ${r.level.level}: ${r.level.name}!`, { description: `${r.total.toLocaleString()} points`, duration: 6000 });
      for (const a of r.unlocked) toast.success(`Achievement unlocked: ${a.name}`, { description: a.description, duration: 6000 });
    };
    window.addEventListener(EVENT, onReward);
    return () => window.removeEventListener(EVENT, onReward);
  }, [utils]);
  return confetti ? <Confetti key={confetti} onDone={() => setConfetti(0)} /> : null;
}
