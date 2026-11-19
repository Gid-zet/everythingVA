import { describe, expect, it } from "vitest";
import { computeRemindAt, digestDue, relativeToNow, zonedParts, zonedToUtc } from "../reminders";

const s = { timezone: "America/New_York", defaultReminderMinutes: 30, dateOnlyReminderHour: 9 };

describe("time zones", () => {
  it("converts local wall time to UTC, with daylight saving", () => {
    expect(zonedToUtc("2026-11-19", "15:00", "America/New_York").toISOString()).toBe("2026-11-19T20:00:00.000Z"); // EST −5
    expect(zonedToUtc("2026-07-01", "15:00", "America/New_York").toISOString()).toBe("2026-07-01T19:00:00.000Z"); // EDT −4
    expect(zonedToUtc("2026-11-19", "15:00", "Africa/Accra").toISOString()).toBe("2026-11-19T15:00:00.000Z");
    expect(zonedToUtc("2026-11-19", "09:00", "Asia/Kolkata").toISOString()).toBe("2026-11-19T03:30:00.000Z");
  });
  it("reads local parts of an instant", () => {
    expect(zonedParts(new Date("2026-11-19T20:00:00Z"), "America/New_York")).toMatchObject({ date: "2026-11-19", hour: 15 });
    expect(zonedParts(new Date("2026-11-20T03:00:00Z"), "America/New_York")).toMatchObject({ date: "2026-11-19", hour: 22 });
  });
});

describe("computeRemindAt", () => {
  const base = { status: "todo", dueDate: "2026-11-19", dueTime: "15:00", reminderMinutes: null };
  it("uses the default before a timed task", () => {
    expect(computeRemindAt(base, s)?.toISOString()).toBe("2026-11-19T19:30:00.000Z");
  });
  it("honours the task's own minutes, at-time and none", () => {
    expect(computeRemindAt({ ...base, reminderMinutes: 60 }, s)?.toISOString()).toBe("2026-11-19T19:00:00.000Z");
    expect(computeRemindAt({ ...base, reminderMinutes: 0 }, s)?.toISOString()).toBe("2026-11-19T20:00:00.000Z");
    expect(computeRemindAt({ ...base, reminderMinutes: -1 }, s)).toBeNull();
  });
  it("reminds date-only tasks at the reminder hour, or days before", () => {
    expect(computeRemindAt({ ...base, dueTime: null }, s)?.toISOString()).toBe("2026-11-19T14:00:00.000Z");
    expect(computeRemindAt({ ...base, dueTime: null, reminderMinutes: 1440 }, s)?.toISOString()).toBe("2026-11-18T14:00:00.000Z");
  });
  it("has no reminder without a date or once done", () => {
    expect(computeRemindAt({ ...base, dueDate: null }, s)).toBeNull();
    expect(computeRemindAt({ ...base, status: "done" }, s)).toBeNull();
  });
  it("falls back to UTC for an unknown time zone", () => {
    expect(computeRemindAt(base, { ...s, timezone: "Mars/Olympus" })?.toISOString()).toBe("2026-11-19T14:30:00.000Z");
  });
});

describe("digest", () => {
  const ds = { timezone: "America/New_York", digestHour: 7, lastDigestDate: null as string | null, digestEnabled: true };
  it("is due once the local hour is reached, once per day", () => {
    expect(digestDue(new Date("2026-11-19T11:00:00Z"), ds)).toBeNull(); // 6 AM local
    expect(digestDue(new Date("2026-11-19T12:05:00Z"), ds)).toBe("2026-11-19"); // 7:05 AM local
    expect(digestDue(new Date("2026-11-19T15:00:00Z"), { ...ds, lastDigestDate: "2026-11-19" })).toBeNull();
    expect(digestDue(new Date("2026-11-19T15:00:00Z"), { ...ds, digestEnabled: false })).toBeNull();
  });
});

describe("relativeToNow", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  it("formats", () => {
    expect(relativeToNow(new Date("2026-11-19T12:30:00Z"), now)).toBe("in 30 min");
    expect(relativeToNow(new Date("2026-11-19T14:00:00Z"), now)).toBe("in 2 h");
    expect(relativeToNow(new Date("2026-11-19T11:45:00Z"), now)).toBe("15 min ago");
    expect(relativeToNow(now, now)).toBe("now");
  });
});
