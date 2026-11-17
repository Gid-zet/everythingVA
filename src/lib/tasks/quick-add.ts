import * as chrono from "chrono-node";
import { toRule, type Rule } from "./recurrence";

/**
 * Natural-language quick add, in the style of Todoist and Super Productivity:
 *
 *   "Send proposal to Acme tomorrow 3pm p1 #Clients @email 30m"
 *   "Water plants every monday"
 *
 *   dates   anywhere ("today", "next tue", "Dec 3", "in 2 days", "friday 9am")
 *   repeat  "every day|weekday|week|month|year|<weekday>", "every 2 weeks", "every other day"
 *   p1–p4   priority (p1 urgent … p4 low)
 *   #name   project, @name label, 30m / 1h / 1h30m estimate
 *
 * Runs in the browser so dates use the user's own time zone. Returns the
 * clean title, the fields, and the character spans it recognised (for
 * highlighting while typing).
 */

export type Priority = "none" | "low" | "medium" | "high" | "urgent";
export type Span = { start: number; end: number; kind: "date" | "repeat" | "priority" | "project" | "label" | "estimate" };

export type QuickAddResult = {
  title: string;
  dueDate?: string;
  dueTime?: string;
  recurrence?: string;
  priority?: Priority;
  project?: string;
  labels: string[];
  estimateMinutes?: number;
  spans: Span[];
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WD = "sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?";
const pad = (n: number) => String(n).padStart(2, "0");
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const weekdayIndex = (w: string) => WEEKDAYS.findIndex((d) => d.startsWith(w.toLowerCase().slice(0, 3)));

export function parseQuickAdd(input: string, now: Date = new Date()): QuickAddResult {
  const spans: Span[] = [];
  // Consumed characters are blanked (same length) so later patterns and chrono
  // see the remaining text at the original positions.
  let mask = input;
  const take = (start: number, end: number, kind: Span["kind"]) => {
    spans.push({ start, end, kind });
    mask = mask.slice(0, start) + " ".repeat(end - start) + mask.slice(end);
  };
  const result: QuickAddResult = { title: "", labels: [], spans };

  // Repeat: "every …"
  const rep = new RegExp(
    String.raw`(?:^|\s)(every\s+(?:(other)\s+|(\d{1,3})\s+)?(day|days|weekday|weekdays|workday|workdays|week|weeks|month|months|year|years|${WD})s?)(?=[\s,.]|$)`,
    "i",
  ).exec(mask);
  let repeatWeekday: number | null = null;
  if (rep) {
    const [, phrase, other, num, unitRaw] = rep;
    const unit = unitRaw!.toLowerCase();
    const interval = other ? 2 : num ? Number(num) : 1;
    let rule: Rule;
    if (/^(weekday|workday)s?$/.test(unit)) rule = { freq: "WEEKLY", interval: 1, byDay: [1, 2, 3, 4, 5] };
    else if (/^days?$/.test(unit)) rule = { freq: "DAILY", interval };
    else if (/^weeks?$/.test(unit)) rule = { freq: "WEEKLY", interval };
    else if (/^months?$/.test(unit)) rule = { freq: "MONTHLY", interval };
    else if (/^years?$/.test(unit)) rule = { freq: "YEARLY", interval };
    else {
      repeatWeekday = weekdayIndex(unit);
      rule = { freq: "WEEKLY", interval, byDay: [repeatWeekday] };
    }
    result.recurrence = toRule(rule);
    const start = rep.index + rep[0].indexOf(phrase!);
    take(start, start + phrase!.length, "repeat");
  }

  // Priority: p1–p4
  const pri = /(?:^|\s)(p[1-4])(?=\s|$)/i.exec(mask);
  if (pri) {
    result.priority = (["urgent", "high", "medium", "low"] as const)[Number(pri[1]![1]) - 1];
    const start = pri.index + pri[0].indexOf(pri[1]!);
    take(start, start + 2, "priority");
  }

  // Project: #name (first one wins)
  const proj = /(?:^|\s)#([\p{L}\p{N}_-]+)/u.exec(mask);
  if (proj) {
    result.project = proj[1]!.replace(/[_-]+/g, " ");
    const start = proj.index + proj[0].indexOf("#");
    take(start, start + 1 + proj[1]!.length, "project");
  }

  // Labels: @name (not the "@" inside an email address)
  for (const m of Array.from(mask.matchAll(/(?:^|\s)@([\p{L}\p{N}_-]+)/gu))) {
    const label = m[1]!.toLowerCase();
    if (!result.labels.includes(label)) result.labels.push(label);
    const start = m.index! + m[0].indexOf("@");
    take(start, start + 1 + m[1]!.length, "label");
  }

  // Estimate: 30m, 45min, 1h, 1.5h, 1h30m
  const est = /(?:^|\s)((\d+(?:\.\d+)?)\s?(h|hr|hrs|hours?)(?:\s?(\d+)\s?(m|min|mins))?|(\d+)\s?(m|min|mins|minutes?))(?=\s|$)/i.exec(mask);
  if (est) {
    const minutes = est[2] ? Math.round(Number(est[2]) * 60 + Number(est[4] ?? 0)) : Number(est[6]);
    if (minutes > 0 && minutes <= 24 * 60) {
      result.estimateMinutes = minutes;
      const start = est.index + est[0].indexOf(est[1]!);
      take(start, start + est[1]!.length, "estimate");
    }
  }

  // Date and time (chrono), forward-looking: "friday" means the next one.
  const parsed = chrono.parse(mask, now, { forwardDate: true })[0];
  if (parsed) {
    const s = parsed.start;
    const d = new Date(s.get("year")!, s.get("month")! - 1, s.get("day")!);
    result.dueDate = localDate(d);
    if (s.isCertain("hour")) result.dueTime = `${pad(s.get("hour")!)}:${pad(s.get("minute") ?? 0)}`;
    // Swallow a leading "on/by/at/due" so "call Bob by friday" → "call Bob".
    let start = parsed.index;
    const before = /(?:^|\s)(on|by|at|due|before)\s+$/i.exec(mask.slice(0, start));
    if (before) start = before.index + before[0].indexOf(before[1]!);
    take(start, parsed.index + parsed.text.length, "date");
  }

  // A repeating task with no date starts on its next occurrence.
  if (result.recurrence && !result.dueDate) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (repeatWeekday !== null) {
      const diff = (repeatWeekday - today.getDay() + 7) % 7;
      result.dueDate = localDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff));
    } else if (/BYDAY=MO,TU,WE,TH,FR/.test(result.recurrence)) {
      const dow = today.getDay();
      const diff = dow === 6 ? 2 : dow === 0 ? 1 : 0;
      result.dueDate = localDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff));
    } else {
      result.dueDate = localDate(today);
    }
  }

  spans.sort((a, b) => a.start - b.start);
  let title = "";
  let pos = 0;
  for (const sp of spans) {
    title += input.slice(pos, sp.start);
    pos = Math.max(pos, sp.end);
  }
  title += input.slice(pos);
  result.title = title.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
  return result;
}

/** Local instant for a date + optional time (null when there's no time). */
export function dueInstant(dueDate?: string | null, dueTime?: string | null): Date | null {
  if (!dueDate || !dueTime) return null;
  const [y, m, d] = dueDate.split("-").map(Number);
  const [hh, mm] = dueTime.split(":").map(Number);
  return new Date(y!, m! - 1, d!, hh, mm);
}
