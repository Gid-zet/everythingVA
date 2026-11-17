import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "../quick-add";
import { describeRule, nextDate, nextDateAfter, parseRule, toRule } from "../recurrence";
import { counts, inboxView, labelView, projectView, todayView, upcomingView, type TaskLike } from "../views";

// Tuesday 17 November 2026, 10:00 local time.
const now = new Date(2026, 10, 17, 10, 0);

describe("parseQuickAdd", () => {
  it("parses a Todoist-style line", () => {
    const r = parseQuickAdd("Send proposal to Acme tomorrow 3pm p1 #Clients @email 30m", now);
    expect(r).toMatchObject({
      title: "Send proposal to Acme",
      dueDate: "2026-11-18",
      dueTime: "15:00",
      priority: "urgent",
      project: "Clients",
      labels: ["email"],
      estimateMinutes: 30,
    });
    expect(r.spans.map((s) => s.kind).sort()).toEqual(["date", "estimate", "label", "priority", "project"]);
  });

  it("keeps plain titles untouched", () => {
    expect(parseQuickAdd("Review the Q4 report", now)).toMatchObject({ title: "Review the Q4 report", labels: [] });
    expect(parseQuickAdd("Review the Q4 report", now).dueDate).toBeUndefined();
  });

  it("drops a dangling 'by' / 'on' before the date", () => {
    expect(parseQuickAdd("Call Bob by friday", now)).toMatchObject({ title: "Call Bob", dueDate: "2026-11-20" });
    expect(parseQuickAdd("Dentist on Dec 3 at 9:30am", now)).toMatchObject({ title: "Dentist", dueDate: "2026-12-03", dueTime: "09:30" });
  });

  it("parses relative dates", () => {
    expect(parseQuickAdd("Follow up in 3 days", now).dueDate).toBe("2026-11-20");
    expect(parseQuickAdd("Plan today", now).dueDate).toBe("2026-11-17");
  });

  it("parses repeats and gives them a first date", () => {
    const fri = parseQuickAdd("Water plants every friday", now);
    expect(fri).toMatchObject({ title: "Water plants", dueDate: "2026-11-20", recurrence: "FREQ=WEEKLY;INTERVAL=1;BYDAY=FR" });
    expect(parseQuickAdd("Standup every weekday 9am", now)).toMatchObject({
      title: "Standup",
      dueTime: "09:00",
      recurrence: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR",
    });
    expect(parseQuickAdd("Invoices every 2 weeks", now)).toMatchObject({ recurrence: "FREQ=WEEKLY;INTERVAL=2", dueDate: "2026-11-17" });
    expect(parseQuickAdd("Stretch every other day", now).recurrence).toBe("FREQ=DAILY;INTERVAL=2");
  });

  it("doesn't treat an email address as a label", () => {
    const r = parseQuickAdd("Reply to max@example.com about pricing", now);
    expect(r.labels).toEqual([]);
    expect(r.title).toBe("Reply to max@example.com about pricing");
  });

  it("parses hour estimates and dashed project names", () => {
    expect(parseQuickAdd("Write report 1h30m #client-work", now)).toMatchObject({ title: "Write report", estimateMinutes: 90, project: "client work" });
  });
});

describe("recurrence", () => {
  it("round-trips rules", () => {
    const r = { freq: "WEEKLY" as const, interval: 1, byDay: [5, 1] };
    expect(toRule(r)).toBe("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,FR");
    expect(parseRule("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,FR")).toEqual({ freq: "WEEKLY", interval: 1, byDay: [1, 5] });
    expect(parseRule("FREQ=HOURLY")).toBeNull();
  });

  it("computes the next date", () => {
    expect(nextDate("2026-11-17", { freq: "DAILY", interval: 1 })).toBe("2026-11-18");
    expect(nextDate("2026-11-20", { freq: "WEEKLY", interval: 1, byDay: [1, 2, 3, 4, 5] })).toBe("2026-11-23"); // Fri → Mon
    expect(nextDate("2026-11-17", { freq: "WEEKLY", interval: 1, byDay: [5] })).toBe("2026-11-20");
    expect(nextDate("2026-11-20", { freq: "WEEKLY", interval: 2, byDay: [5] })).toBe("2026-12-04");
    expect(nextDate("2026-01-31", { freq: "MONTHLY", interval: 1 })).toBe("2026-02-28");
    expect(nextDate("2028-02-29", { freq: "YEARLY", interval: 1 })).toBe("2029-02-28");
  });

  it("skips missed occurrences when completing late", () => {
    expect(nextDateAfter("2026-11-01", { freq: "WEEKLY", interval: 1 }, "2026-11-17")).toBe("2026-11-22");
  });

  it("describes rules", () => {
    expect(describeRule(parseRule("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR"))).toBe("Every weekday");
    expect(describeRule(parseRule("FREQ=WEEKLY;INTERVAL=1;BYDAY=FR"))).toBe("Every Friday");
    expect(describeRule(parseRule("FREQ=MONTHLY;INTERVAL=3"))).toBe("Every 3 months");
  });
});

describe("views", () => {
  const base: Omit<TaskLike, "id"> = { status: "todo", priority: "none", dueDate: null, dueTime: null, projectId: null, labels: [], parentId: null, sortOrder: 1, completedAt: null };
  const t = (id: string, over: Partial<TaskLike> = {}): TaskLike => ({ ...base, id, ...over });
  const today = "2026-11-17";
  const tasks = [
    t("late", { dueDate: "2026-11-15", priority: "high" }),
    t("t1", { dueDate: today, dueTime: "15:00" }),
    t("t2", { dueDate: today, priority: "urgent" }),
    t("t3", { dueDate: today, dueTime: "09:00" }),
    t("done", { dueDate: today, status: "done" }),
    t("tmrw", { dueDate: "2026-11-18" }),
    t("far", { dueDate: "2027-01-10" }),
    t("proj", { projectId: "p1", status: "in_progress", labels: ["calls"] }),
    t("sub", { parentId: "proj", projectId: "p1" }),
  ];

  it("today: overdue first, then timed by time, then priority", () => {
    const v = todayView(tasks, today);
    expect(v.map((g) => g.key)).toEqual(["overdue", "today"]);
    expect(v[1]!.tasks.map((x) => x.id)).toEqual(["t3", "t1", "t2"]);
  });
  it("upcoming groups by day and puts the rest under Later", () => {
    const v = upcomingView(tasks, today);
    expect(v[0]).toMatchObject({ key: "2026-11-18" });
    expect(v[0]!.tasks.map((x) => x.id)).toEqual(["tmrw"]);
    expect(v.at(-1)).toMatchObject({ key: "later" });
  });
  it("inbox, project, label and counts", () => {
    expect(inboxView(tasks).map((x) => x.id)).not.toContain("proj");
    expect(projectView(tasks, "p1")[0]!.tasks.map((x) => x.id)).toEqual(["proj"]);
    expect(labelView(tasks, "calls").map((x) => x.id)).toEqual(["proj"]);
    expect(counts(tasks, today)).toMatchObject({ today: 4, overdue: 1, upcoming: 1, byProject: { p1: 1 }, byLabel: { calls: 1 } });
  });
});
