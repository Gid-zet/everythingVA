import { addDays, toDate } from "./recurrence";

/**
 * Productivity game rules (pure; unit-tested).
 *
 * Built from what works in the best-known systems:
 *  - Todoist Karma: points for completing tasks on time, levels that get
 *    harder to climb, daily/weekly goals with bonuses, days off so weekends
 *    don't break streaks, vacation mode.
 *  - Duolingo: a daily streak protected by streak freezes you earn (one per
 *    7 goal days, hold up to 2), because a single broken streak makes people
 *    give up.
 *  - Achievements for milestones and for using the connected workflow
 *    (email, calendar, procurement).
 * Deliberately no point penalties for overdue tasks: it's encouragement,
 * not guilt, and it can be switched off.
 */

export const POINTS = {
  base: 10,
  priority: { urgent: 8, high: 5, medium: 3, low: 1, none: 0 } as Record<string, number>,
  onTime: 4,
  connected: 2, // the task came from an email, event or opportunity
  dailyGoal: 25,
  weeklyGoal: 100,
  streakPerDay: 2, // daily-goal bonus grows with the streak…
  streakCap: 10, // …up to 10 days
};

export function pointsForCompletion(t: { priority: string; dueDate: string | null; source: string | null }, localDate: string) {
  const onTime = !t.dueDate || localDate <= t.dueDate;
  const points = POINTS.base + (POINTS.priority[t.priority] ?? 0) + (onTime ? POINTS.onTime : 0) + (t.source ? POINTS.connected : 0);
  return { points, onTime };
}

export const LEVELS = [
  { name: "Starter", min: 0 },
  { name: "Doer", min: 250 },
  { name: "Achiever", min: 750 },
  { name: "Pro", min: 1500 },
  { name: "Expert", min: 3000 },
  { name: "Master", min: 5000 },
  { name: "Grandmaster", min: 8000 },
  { name: "Legend", min: 12000 },
  { name: "Mythic", min: 20000 },
  { name: "Enlightened", min: 35000 },
] as const;

export function levelFor(points: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1]!.min) i++;
  const cur = LEVELS[i]!;
  const next = LEVELS[i + 1];
  return {
    level: i + 1,
    name: cur.name,
    floor: cur.min,
    next: next?.min ?? null,
    nextName: next?.name ?? null,
    progress: next ? (points - cur.min) / (next.min - cur.min) : 1,
  };
}

/** Monday-based week key (Todoist weeks start Monday). */
export function weekStart(date: string) {
  const dow = toDate(date).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

export type StreakSettings = { dailyGoal: number; daysOff: number[]; vacation: boolean };

/**
 * Walk forward day by day from the first completion. A day meets the goal
 * when its count >= dailyGoal. Days off (and vacation) are skipped. A missed
 * working day uses a freeze if one is held, else resets the streak. Today
 * never breaks a streak while it's still in progress.
 */
export function computeStreak(countsByDay: Record<string, number>, today: string, s: StreakSettings) {
  const days = Object.keys(countsByDay).filter((d) => countsByDay[d]! > 0).sort();
  if (!days.length) return { current: 0, longest: 0, freezes: 0, frozeDays: [] as string[], todayMet: false };
  let current = 0;
  let longest = 0;
  let freezes = 0;
  const frozeDays: string[] = [];
  for (let d = days[0]!; d <= today; d = addDays(d, 1)) {
    const met = (countsByDay[d] ?? 0) >= s.dailyGoal;
    const off = s.daysOff.includes(toDate(d).getUTCDay());
    if (met) {
      current++;
      if (current % 7 === 0) freezes = Math.min(2, freezes + 1);
    } else if (d === today || off || (s.vacation && d >= addDays(today, -1))) {
      // in progress, a day off, or vacation: no change
    } else if (freezes > 0) {
      freezes--;
      frozeDays.push(d);
    } else {
      current = 0;
    }
    longest = Math.max(longest, current);
  }
  return { current, longest, freezes, frozeDays, todayMet: (countsByDay[today] ?? 0) >= s.dailyGoal };
}

export type Stats = {
  total: number;
  onTime: number;
  urgent: number;
  fromEmail: number;
  fromCalendar: number;
  fromProcurement: number;
  earlyBird: boolean;
  goalDays: number;
  longestStreak: number;
  inboxZero: boolean;
  clearedToday: boolean;
};

export const ACHIEVEMENTS: { key: string; name: string; description: string; check: (s: Stats) => boolean }[] = [
  { key: "first_task", name: "First step", description: "Complete your first task", check: (s) => s.total >= 1 },
  { key: "ten_tasks", name: "Getting going", description: "Complete 10 tasks", check: (s) => s.total >= 10 },
  { key: "century", name: "Century", description: "Complete 100 tasks", check: (s) => s.total >= 100 },
  { key: "five_hundred", name: "Unstoppable", description: "Complete 500 tasks", check: (s) => s.total >= 500 },
  { key: "on_time_25", name: "Punctual", description: "Finish 25 tasks on or before their due date", check: (s) => s.onTime >= 25 },
  { key: "urgent_10", name: "Firefighter", description: "Complete 10 urgent tasks", check: (s) => s.urgent >= 10 },
  { key: "early_bird", name: "Early bird", description: "Complete a task before 9 AM", check: (s) => s.earlyBird },
  { key: "goal_1", name: "Goal!", description: "Hit your daily goal", check: (s) => s.goalDays >= 1 },
  { key: "goal_10", name: "Consistent", description: "Hit your daily goal on 10 days", check: (s) => s.goalDays >= 10 },
  { key: "streak_3", name: "On a roll", description: "Reach a 3-day streak", check: (s) => s.longestStreak >= 3 },
  { key: "streak_7", name: "Week warrior", description: "Reach a 7-day streak", check: (s) => s.longestStreak >= 7 },
  { key: "streak_30", name: "Habit formed", description: "Reach a 30-day streak", check: (s) => s.longestStreak >= 30 },
  { key: "inbox_zero", name: "Inbox zero", description: "Empty your task Inbox", check: (s) => s.inboxZero },
  { key: "clean_slate", name: "Clean slate", description: "Clear everything due today, with nothing overdue", check: (s) => s.clearedToday },
  { key: "email_tamer", name: "Email tamer", description: "Complete 10 tasks created from emails", check: (s) => s.fromEmail >= 10 },
  { key: "meeting_ready", name: "Meeting ready", description: "Complete 5 tasks from calendar events", check: (s) => s.fromCalendar >= 5 },
  { key: "bid_builder", name: "Bid builder", description: "Complete 5 procurement tasks", check: (s) => s.fromProcurement >= 5 },
];

export const newlyUnlocked = (stats: Stats, have: Set<string>) => ACHIEVEMENTS.filter((a) => !have.has(a.key) && a.check(stats));

/** Where a task came from, for points and achievements. */
export const taskSource = (t: { threadId?: string | null; eventId?: string | null; opportunityId?: string | null }) =>
  t.opportunityId ? "procurement" : t.eventId ? "calendar" : t.threadId ? "email" : null;
