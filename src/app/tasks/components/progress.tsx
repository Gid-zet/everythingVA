"use client";
import React from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Award, CalendarClock, Flame, Landmark, Loader2, Lock, Mail, Snowflake, Sparkles, Target, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LEVELS } from "@/lib/tasks/gamification";
import type { Productivity, TaskStore } from "./store";
import { LevelBadge, Ring } from "./progress-card";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ACH_ICON: Record<string, React.ElementType> = {
  email_tamer: Mail,
  meeting_ready: CalendarClock,
  bid_builder: Landmark,
  streak_3: Flame,
  streak_7: Flame,
  streak_30: Flame,
  goal_1: Target,
  goal_10: Target,
};

export function ProgressView({ data, store }: { data: Productivity | undefined; store: TaskStore }) {
  if (!data) return <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />;
  const { level, today, week, streak, history, achievements } = data;
  const unlocked = achievements.filter((a) => a.unlockedAt).length;
  const chart = history.map((h) => ({ ...h, label: new Date(`${h.date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) }));

  return (
    <div className="space-y-5">
      {!data.settings.enabled && (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Points and celebrations are off. Your history is still tracked; turn them back on below.</p>
      )}

      {/* Level */}
      <section className="relative overflow-hidden rounded-2xl border bg-card p-5">
        <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(50%_120%_at_0%_0%,rgba(98,80,214,0.12),transparent)]" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-4">
          <LevelBadge level={level.level} className="size-14 text-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Level {level.level}</p>
            <p className="text-2xl font-semibold tracking-tight">{level.name}</p>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{data.total.toLocaleString()}</span> points
              {level.next && ` · ${(level.next - data.total).toLocaleString()} to ${level.nextName}`}
            </p>
          </div>
        </div>
        <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--viz-track)]">
          <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.round(level.progress * 100)}%`, background: "linear-gradient(90deg, var(--viz-1), #6250d6)" }} />
        </div>
        <div className="relative mt-3 flex gap-1 overflow-x-auto">
          {LEVELS.map((l, i) => (
            <span key={l.name} className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px]", i + 1 <= level.level ? "bg-[var(--viz-1)]/10 font-medium text-foreground" : "text-muted-foreground")}>
              {l.name}
            </span>
          ))}
        </div>
      </section>

      {/* Goals and streak */}
      <div className="grid gap-3 sm:grid-cols-3">
        <section className="flex items-center gap-4 rounded-2xl border bg-card p-4">
          <Ring value={today.done} max={today.goal}>
            <span className="text-sm font-semibold tabular-nums">
              {today.done}/{today.goal}
            </span>
          </Ring>
          <div>
            <p className="text-xs text-muted-foreground">Daily goal</p>
            <p className="text-sm font-medium">{today.done >= today.goal ? "Reached today" : `${today.goal - today.done} to go`}</p>
          </div>
        </section>
        <section className="flex items-center gap-4 rounded-2xl border bg-card p-4">
          <Ring value={week.done} max={week.goal}>
            <span className="text-sm font-semibold tabular-nums">{week.done}</span>
          </Ring>
          <div>
            <p className="text-xs text-muted-foreground">This week</p>
            <p className="text-sm font-medium">{week.done >= week.goal ? "Weekly goal reached" : `${week.goal - week.done} to reach ${week.goal}`}</p>
          </div>
        </section>
        <section className="flex items-center gap-4 rounded-2xl border bg-card p-4">
          <span className={cn("flex size-16 shrink-0 flex-col items-center justify-center rounded-full", streak.current ? "bg-orange-500/10 text-orange-600 dark:text-orange-400" : "bg-muted text-muted-foreground")}>
            <Flame className="size-5" />
            <span className="text-sm font-semibold tabular-nums">{streak.current}</span>
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Day streak</p>
            <p className="text-sm font-medium">Best {streak.longest}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground" title="Earn a freeze every 7 goal days (hold up to 2). A freeze covers a missed working day.">
              {[0, 1].map((i) => (
                <Snowflake key={i} className={cn("size-3.5", i < streak.freezes ? "text-sky-500" : "text-muted-foreground/30")} />
              ))}
              {streak.freezes} freeze{streak.freezes === 1 ? "" : "s"}
            </p>
          </div>
        </section>
      </div>

      {/* History */}
      <section className="rounded-2xl border bg-card p-5">
        <p className="text-[13px] font-semibold">Completed per day</p>
        <p className="text-xs text-muted-foreground">Last 30 days · line shows your daily goal</p>
        <div className="mt-3 h-44" role="img" aria-label={`Tasks completed per day; ${history.filter((h) => h.count >= today.goal).length} of 30 days met the goal`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
              <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} interval={6} />
              <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="whitespace-nowrap rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                      <p className="text-muted-foreground">{label}</p>
                      <p className="font-semibold">{String(payload[0]!.value)} completed</p>
                    </div>
                  ) : null
                }
              />
              <ReferenceLine y={today.goal} stroke="var(--viz-good)" strokeWidth={1} />
              <Bar dataKey="count" fill="var(--viz-1)" maxBarSize={16} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Achievements */}
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex items-baseline justify-between">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Trophy className="size-4" /> Achievements
          </p>
          <span className="text-xs tabular-nums text-muted-foreground">
            {unlocked} of {achievements.length}
          </span>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {achievements.map((a) => {
            const Icon = a.unlockedAt ? (ACH_ICON[a.key] ?? Award) : Lock;
            return (
              <li key={a.key} className={cn("flex items-start gap-3 rounded-xl border p-3", !a.unlockedAt && "opacity-60")}>
                <span
                  className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", a.unlockedAt ? "text-white" : "bg-muted text-muted-foreground")}
                  style={a.unlockedAt ? { background: "linear-gradient(135deg, #eda100, #eb6834)" } : undefined}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{a.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>
                  {a.unlockedAt && <p className="mt-0.5 text-[11px] text-muted-foreground">{new Date(a.unlockedAt).toLocaleDateString()}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Sparkles className="size-4" /> How points work
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>Complete a task: 10, plus 8 / 5 / 3 / 1 for urgent / high / medium / low priority</li>
            <li>On time (no due date, or done by it): +4</li>
            <li>From an email, calendar event or opportunity: +2</li>
            <li>Daily goal: +25, plus 2 per streak day (up to 10). Weekly goal: +100</li>
            <li>Un-completing a task takes its points back. Nothing is ever deducted for overdue tasks.</li>
          </ul>
          {data.recent.length > 0 && (
            <ul className="mt-4 space-y-1 border-t pt-3 text-xs">
              {data.recent.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-2">
                  <span className="truncate">{r.kind === "daily_goal" ? "Daily goal bonus" : r.kind === "weekly_goal" ? "Weekly goal bonus" : (r.task?.title ?? "Deleted task")}</span>
                  <span className="shrink-0 font-medium tabular-nums text-emerald-700 dark:text-emerald-400">+{r.points}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Settings data={data} store={store} />
      </div>
    </div>
  );
}

function Settings({ data, store }: { data: Productivity; store: TaskStore }) {
  const [s, setS] = React.useState({
    enabled: data.settings.enabled,
    dailyGoal: data.settings.dailyGoal,
    weeklyGoal: data.settings.weeklyGoal,
    daysOff: data.settings.daysOff,
    vacation: data.settings.vacation,
  });
  const [saving, setSaving] = React.useState(false);
  const field = "h-8 w-20 rounded-md border bg-background px-2 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <section className="rounded-2xl border bg-card p-5">
      <p className="text-[13px] font-semibold">Goals and settings</p>
      <div className="mt-3 space-y-3 text-sm">
        <label className="flex items-center justify-between gap-3">
          <span>Points, levels and celebrations</span>
          <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} className="size-4" />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>Daily goal (tasks)</span>
          <input type="number" min={1} max={100} className={field} value={s.dailyGoal} onChange={(e) => setS({ ...s, dailyGoal: Number(e.target.value) || 1 })} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>Weekly goal (tasks)</span>
          <input type="number" min={1} max={500} className={field} value={s.weeklyGoal} onChange={(e) => setS({ ...s, weeklyGoal: Number(e.target.value) || 1 })} />
        </label>
        <div>
          <p>Days off (don't break your streak)</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {DAYS.map((d, i) => {
              const on = s.daysOff.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setS({ ...s, daysOff: on ? s.daysOff.filter((x) => x !== i) : [...s.daysOff, i] })}
                  className={cn("rounded-md border px-2 py-1 text-xs", on ? "bg-foreground text-background" : "text-muted-foreground")}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <label className="flex items-center justify-between gap-3">
          <span>Vacation mode (pause streaks)</span>
          <input type="checkbox" checked={s.vacation} onChange={(e) => setS({ ...s, vacation: e.target.checked })} className="size-4" />
        </label>
      </div>
      <Button
        size="sm"
        className="mt-4"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await store.saveProductivitySettings(s);
            toast.success("Settings saved");
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving && <Loader2 className="mr-2 size-3.5 animate-spin" />}Save
      </Button>
    </section>
  );
}
