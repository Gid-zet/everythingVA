import "server-only";
import type { PrismaClient } from "@prisma/client";
import { addDays } from "@/lib/tasks/recurrence";
import {
  ACHIEVEMENTS,
  POINTS,
  computeStreak,
  levelFor,
  newlyUnlocked,
  pointsForCompletion,
  taskSource,
  weekStart,
  type Stats,
} from "@/lib/tasks/gamification";

export type Reward = {
  enabled: boolean;
  points: number;
  bonuses: { label: string; points: number }[];
  total: number;
  level: ReturnType<typeof levelFor>;
  levelUp: boolean;
  goal: { done: number; target: number; reached: boolean };
  streak: number;
  unlocked: { key: string; name: string; description: string }[];
};

export async function getSettings(db: PrismaClient, userId: string) {
  return (
    (await db.productivitySettings.findUnique({ where: { userId } })) ?? { userId, enabled: true, dailyGoal: 5, weeklyGoal: 25, daysOff: [0, 6], vacation: false }
  );
}

export async function countsByDay(db: PrismaClient, userId: string, today: string) {
  const rows = await db.taskCompletion.groupBy({
    by: ["localDate"],
    where: { userId, kind: "task", localDate: { gte: addDays(today, -400) } },
    _count: true,
  });
  return Object.fromEntries(rows.map((r) => [r.localDate, r._count])) as Record<string, number>;
}

const totalPoints = async (db: PrismaClient, userId: string) =>
  (await db.taskCompletion.aggregate({ where: { userId }, _sum: { points: true } }))._sum.points ?? 0;

async function stats(db: PrismaClient, userId: string, today: string, longestStreak: number): Promise<Stats> {
  const [total, onTime, urgent, sources, early, goalDays, inboxOpen, dueOpen, doneToday] = await Promise.all([
    db.taskCompletion.count({ where: { userId, kind: "task" } }),
    db.taskCompletion.count({ where: { userId, kind: "task", onTime: true } }),
    db.taskCompletion.count({ where: { userId, kind: "task", priority: "urgent" } }),
    db.taskCompletion.groupBy({ by: ["source"], where: { userId, kind: "task", source: { not: null } }, _count: true }),
    db.taskCompletion.count({ where: { userId, kind: "task", localHour: { lt: 9 } } }),
    db.taskCompletion.count({ where: { userId, kind: "daily_goal" } }),
    db.task.count({ where: { userId, projectId: null, parentId: null, status: { notIn: ["done", "canceled"] } } }),
    db.task.count({ where: { userId, dueDate: { lte: today }, status: { notIn: ["done", "canceled"] } } }),
    db.taskCompletion.count({ where: { userId, kind: "task", localDate: today } }),
  ]);
  const by = (s: string) => sources.find((x) => x.source === s)?._count ?? 0;
  return {
    total,
    onTime,
    urgent,
    fromEmail: by("email"),
    fromCalendar: by("calendar"),
    fromProcurement: by("procurement"),
    earlyBird: early > 0,
    goalDays,
    longestStreak,
    inboxZero: inboxOpen === 0 && total >= 3,
    clearedToday: dueOpen === 0 && doneToday >= 3,
  };
}

/**
 * Record a completed task and work out what it earned: points, goal and
 * streak bonuses, level-ups and achievements. Always recorded (the stats stay
 * correct); `enabled` tells the UI whether to celebrate.
 */
export async function recordCompletion(
  db: PrismaClient,
  userId: string,
  task: { id: string; priority: string; dueDate: string | null; threadId: string | null; eventId: string | null; opportunityId: string | null },
  at: { today: string; hour?: number },
): Promise<Reward> {
  const settings = await getSettings(db, userId);
  const before = await totalPoints(db, userId);
  const source = taskSource(task);
  const { points, onTime } = pointsForCompletion({ priority: task.priority, dueDate: task.dueDate, source }, at.today);
  await db.taskCompletion.create({
    data: { userId, taskId: task.id, kind: "task", localDate: at.today, localHour: at.hour ?? null, points, onTime, priority: task.priority, source },
  });

  const counts = await countsByDay(db, userId, at.today);
  const streak = computeStreak(counts, at.today, settings);
  const doneToday = counts[at.today] ?? 0;
  const bonuses: Reward["bonuses"] = [];

  if (doneToday >= settings.dailyGoal) {
    const already = await db.taskCompletion.findFirst({ where: { userId, kind: "daily_goal", localDate: at.today } });
    if (!already) {
      const p = POINTS.dailyGoal + POINTS.streakPerDay * Math.min(streak.current, POINTS.streakCap);
      await db.taskCompletion.create({ data: { userId, kind: "daily_goal", localDate: at.today, points: p } });
      bonuses.push({ label: streak.current > 1 ? `Daily goal · ${streak.current}-day streak` : "Daily goal", points: p });
    }
  }
  const week = weekStart(at.today);
  const weekDone = Object.entries(counts).filter(([d]) => d >= week && d <= at.today).reduce((n, [, c]) => n + c, 0);
  if (weekDone >= settings.weeklyGoal) {
    const already = await db.taskCompletion.findFirst({ where: { userId, kind: "weekly_goal", localDate: week } });
    if (!already) {
      await db.taskCompletion.create({ data: { userId, kind: "weekly_goal", localDate: week, points: POINTS.weeklyGoal } });
      bonuses.push({ label: "Weekly goal", points: POINTS.weeklyGoal });
    }
  }

  const have = new Set((await db.userAchievement.findMany({ where: { userId }, select: { key: true } })).map((a) => a.key));
  const unlocked = newlyUnlocked(await stats(db, userId, at.today, streak.longest), have);
  if (unlocked.length) await db.userAchievement.createMany({ data: unlocked.map((a) => ({ userId, key: a.key })), skipDuplicates: true });

  const after = before + points + bonuses.reduce((n, b) => n + b.points, 0);
  return {
    enabled: settings.enabled,
    points,
    bonuses,
    total: after,
    level: levelFor(after),
    levelUp: levelFor(after).level > levelFor(before).level,
    goal: { done: doneToday, target: settings.dailyGoal, reached: doneToday >= settings.dailyGoal },
    streak: streak.current,
    unlocked: unlocked.map(({ key, name, description }) => ({ key, name, description })),
  };
}

/** A task was un-completed: take back the points it earned (bonuses and badges stay). */
export async function undoCompletion(db: PrismaClient, userId: string, taskId: string) {
  const last = await db.taskCompletion.findFirst({ where: { userId, taskId, kind: "task" }, orderBy: { completedAt: "desc" } });
  if (last) await db.taskCompletion.delete({ where: { id: last.id } });
}

/** Everything the progress page shows. */
export async function productivity(db: PrismaClient, userId: string, today: string) {
  const settings = await getSettings(db, userId);
  const [total, counts, unlockedRows, recent] = await Promise.all([
    totalPoints(db, userId),
    countsByDay(db, userId, today),
    db.userAchievement.findMany({ where: { userId } }),
    db.taskCompletion.findMany({
      where: { userId },
      orderBy: { completedAt: "desc" },
      take: 8,
      select: { id: true, kind: true, points: true, completedAt: true, source: true, task: { select: { id: true, title: true } } },
    }),
  ]);
  const streak = computeStreak(counts, today, settings);
  const week = weekStart(today);
  const history = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(today, i - 29);
    return { date, count: counts[date] ?? 0 };
  });
  const unlocked = new Map(unlockedRows.map((u) => [u.key, u.unlockedAt]));
  return {
    settings,
    total,
    level: levelFor(total),
    today: { done: counts[today] ?? 0, goal: settings.dailyGoal },
    week: { done: Object.entries(counts).filter(([d]) => d >= week && d <= today).reduce((n, [, c]) => n + c, 0), goal: settings.weeklyGoal },
    streak,
    history,
    achievements: ACHIEVEMENTS.map((a) => ({ key: a.key, name: a.name, description: a.description, unlockedAt: unlocked.get(a.key) ?? null })),
    recent,
  };
}
