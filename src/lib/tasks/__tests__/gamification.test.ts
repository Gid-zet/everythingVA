import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, computeStreak, levelFor, newlyUnlocked, pointsForCompletion, taskSource, weekStart, type Stats } from "../gamification";

const settings = { dailyGoal: 2, daysOff: [0, 6], vacation: false };

describe("points", () => {
  it("rewards priority, on-time and connected work", () => {
    expect(pointsForCompletion({ priority: "none", dueDate: null, source: null }, "2026-11-17")).toEqual({ points: 14, onTime: true });
    expect(pointsForCompletion({ priority: "urgent", dueDate: "2026-11-18", source: "email" }, "2026-11-17").points).toBe(24);
    expect(pointsForCompletion({ priority: "high", dueDate: "2026-11-10", source: null }, "2026-11-17")).toEqual({ points: 15, onTime: false });
  });
  it("maps points to levels", () => {
    expect(levelFor(0)).toMatchObject({ level: 1, name: "Starter", next: 250 });
    expect(levelFor(800)).toMatchObject({ level: 3, name: "Achiever", floor: 750, nextName: "Pro" });
    expect(levelFor(999999)).toMatchObject({ name: "Enlightened", next: null, progress: 1 });
  });
  it("tags where a task came from", () => {
    expect(taskSource({ threadId: "t" })).toBe("email");
    expect(taskSource({ eventId: "e", threadId: "t" })).toBe("calendar");
    expect(taskSource({ opportunityId: "o" })).toBe("procurement");
    expect(taskSource({})).toBeNull();
  });
  it("weeks start on Monday", () => {
    expect(weekStart("2026-11-17")).toBe("2026-11-16"); // Tue → Mon
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // Sun → Mon
  });
});

describe("streaks", () => {
  // Mon 16 … Fri 20 Nov 2026; Sat/Sun off.
  it("counts consecutive goal days and skips days off", () => {
    const c = { "2026-11-12": 2, "2026-11-13": 3, "2026-11-16": 2, "2026-11-17": 2 }; // Thu, Fri, (weekend), Mon, Tue
    expect(computeStreak(c, "2026-11-17", settings)).toMatchObject({ current: 4, longest: 4, todayMet: true });
  });
  it("doesn't break on today while it's in progress", () => {
    expect(computeStreak({ "2026-11-16": 2, "2026-11-17": 1 }, "2026-11-17", settings)).toMatchObject({ current: 1, todayMet: false });
  });
  it("resets after a missed working day without a freeze", () => {
    expect(computeStreak({ "2026-11-12": 2, "2026-11-16": 2 }, "2026-11-16", settings).current).toBe(1); // Fri 13 missed
  });
  it("earns a freeze every 7 goal days and spends it on a missed day", () => {
    const counts: Record<string, number> = {};
    for (const d of ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"]) counts[d] = 2;
    counts["2026-11-12"] = 2; // Wed 11 missed → freeze used
    const r = computeStreak(counts, "2026-11-12", settings);
    expect(r).toMatchObject({ current: 8, freezes: 0, frozeDays: ["2026-11-11"] });
  });
});

describe("achievements", () => {
  const empty: Stats = { total: 0, onTime: 0, urgent: 0, fromEmail: 0, fromCalendar: 0, fromProcurement: 0, earlyBird: false, goalDays: 0, longestStreak: 0, inboxZero: false, clearedToday: false };
  it("unlocks only new ones", () => {
    const got = newlyUnlocked({ ...empty, total: 12, earlyBird: true }, new Set(["first_task"])).map((a) => a.key);
    expect(got).toEqual(["ten_tasks", "early_bird"]);
  });
  it("has unique keys", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.key)).size).toBe(ACHIEVEMENTS.length);
  });
});
