/**
 * Task repeat rules: a small, explicit subset of RRULE that covers what
 * people type ("every day", "every weekday", "every 2 weeks", "every friday",
 * "every month", "every year"). Works on calendar dates (YYYY-MM-DD), so
 * repeating never drifts across time zones or daylight saving.
 */

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type Rule = { freq: Freq; interval: number; byDay?: number[] }; // byDay: 0=Sun … 6=Sat

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function toRule(r: Rule): string {
  const parts = [`FREQ=${r.freq}`, `INTERVAL=${r.interval}`];
  if (r.byDay?.length) parts.push(`BYDAY=${[...r.byDay].sort((a, b) => a - b).map((d) => DAY_CODES[d]).join(",")}`);
  return parts.join(";");
}

export function parseRule(s: string | null | undefined): Rule | null {
  if (!s) return null;
  const kv = Object.fromEntries(s.split(";").map((p) => p.split("=") as [string, string]));
  const freq = kv.FREQ as Freq;
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;
  const interval = Math.max(1, Math.min(999, Number(kv.INTERVAL ?? 1) || 1));
  const byDay = kv.BYDAY
    ? kv.BYDAY.split(",")
        .map((c) => DAY_CODES.indexOf(c as (typeof DAY_CODES)[number]))
        .filter((d) => d >= 0)
    : undefined;
  return { freq, interval, ...(byDay?.length ? { byDay } : {}) };
}

/** Calendar-date arithmetic in UTC so local time zones don't matter. */
export const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
export const fromDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => fromDate(new Date(toDate(s).getTime() + n * 86400_000));

function addMonths(s: string, n: number) {
  const d = toDate(s);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last)); // 31 Jan + 1 month = 28/29 Feb
  return fromDate(target);
}

/** The next due date strictly after `from` (normally the current due date). */
export function nextDate(from: string, rule: Rule): string {
  switch (rule.freq) {
    case "DAILY":
      return addDays(from, rule.interval);
    case "WEEKLY": {
      if (!rule.byDay?.length) return addDays(from, 7 * rule.interval);
      // Next listed weekday in this week; else the first listed day `interval` weeks on.
      const dow = toDate(from).getUTCDay();
      const days = [...rule.byDay].sort((a, b) => a - b);
      const later = days.find((d) => d > dow);
      if (later !== undefined) return addDays(from, later - dow);
      return addDays(from, 7 * (rule.interval - 1) + (7 - dow + days[0]!));
    }
    case "MONTHLY":
      return addMonths(from, rule.interval);
    case "YEARLY":
      return addMonths(from, 12 * rule.interval);
  }
}

/** Next due date that's after `today` too (completing an overdue repeating task skips missed ones). */
export function nextDateAfter(from: string, rule: Rule, today: string): string {
  let d = nextDate(from, rule);
  for (let i = 0; d <= today && i < 1000; i++) d = nextDate(d, rule);
  return d;
}

export function describeRule(r: Rule | null): string {
  if (!r) return "";
  const n = r.interval;
  if (r.freq === "WEEKLY" && r.byDay?.length) {
    const sorted = [...r.byDay].sort((a, b) => a - b);
    if (sorted.join() === "1,2,3,4,5" && n === 1) return "Every weekday";
    const names = sorted.map((d) => DAY_NAMES[d]).join(", ");
    return n === 1 ? `Every ${names}` : `Every ${n} weeks on ${names}`;
  }
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[r.freq];
  return n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
}
