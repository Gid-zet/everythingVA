/**
 * Reminder timing (pure; unit-tested). Tasks store a local calendar date and
 * optional local time; reminders need an exact instant, so we convert using
 * the user's IANA time zone (daylight saving included).
 */

export type ReminderSettings = { timezone: string; defaultReminderMinutes: number; dateOnlyReminderHour: number };

export const REMINDER_OPTIONS = [
  { value: null, label: "Default" },
  { value: -1, label: "No reminder" },
  { value: 0, label: "At the due time" },
  { value: 5, label: "5 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
  { value: 1440, label: "1 day before" },
] as const;

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of an instant in a time zone. */
export function zonedParts(instant: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const date = `${String(get("year")).padStart(4, "0")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}`;
  return { date, hour: get("hour"), minute: get("minute"), second: get("second") };
}

function offsetMs(instant: Date, tz: string) {
  const p = zonedParts(instant, tz);
  const [y, m, d] = p.date.split("-").map(Number);
  const asUtc = Date.UTC(y!, m! - 1, d!, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant when it's `date` `time` (local wall clock) in `tz`. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  let guess = wall - offsetMs(new Date(wall), tz);
  // Re-check at the guess: the offset can differ across a DST change.
  const second = wall - offsetMs(new Date(guess), tz);
  if (second !== guess) guess = second;
  return new Date(guess);
}

/**
 * When to remind about a task, or null for none:
 *  - timed task: due time minus the task's minutes (or the default);
 *  - date-only task: the reminder hour on the due date (or N days before
 *    when the task asks for a day or more).
 */
export function computeRemindAt(
  t: { status: string; dueDate: string | null; dueTime: string | null; reminderMinutes: number | null },
  s: ReminderSettings,
): Date | null {
  if (!t.dueDate || t.status === "done" || t.status === "canceled") return null;
  if (t.reminderMinutes === -1) return null;
  const tz = isValidTimeZone(s.timezone) ? s.timezone : "UTC";
  if (t.dueTime) {
    const due = zonedToUtc(t.dueDate, t.dueTime, tz);
    return new Date(due.getTime() - (t.reminderMinutes ?? s.defaultReminderMinutes) * 60_000);
  }
  const at = zonedToUtc(t.dueDate, `${String(s.dateOnlyReminderHour).padStart(2, "0")}:00`, tz);
  const days = t.reminderMinutes && t.reminderMinutes >= 1440 ? Math.floor(t.reminderMinutes / 1440) : 0;
  return new Date(at.getTime() - days * 86400_000);
}

/** Should the morning digest go out now? (once per local day, at or after the hour) */
export function digestDue(now: Date, s: { timezone: string; digestHour: number; lastDigestDate: string | null; digestEnabled: boolean }) {
  if (!s.digestEnabled) return null;
  const tz = isValidTimeZone(s.timezone) ? s.timezone : "UTC";
  const p = zonedParts(now, tz);
  if (p.hour < s.digestHour || s.lastDigestDate === p.date) return null;
  return p.date;
}

/** "in 30 min", "in 2 h", "now", "15 min ago". */
export function relativeToNow(due: Date, now: Date) {
  const min = Math.round((due.getTime() - now.getTime()) / 60_000);
  if (Math.abs(min) < 1) return "now";
  const abs = Math.abs(min);
  const text = abs < 60 ? `${abs} min` : abs < 1440 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} d`;
  return min > 0 ? `in ${text}` : `${text} ago`;
}
