/**
 * Recurrence utility library for handling RRULE-style recurrence patterns
 * Supports daily, weekly, monthly, yearly patterns with intervals, weekdays, and end conditions
 */

import { addDays, addWeeks, addMonths, addYears, isSameDay, startOfDay, isBefore, isAfter, setDay, getDay, format } from "date-fns";

export interface RecurrenceRule {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval?: number; // e.g., every 2 weeks
  byWeekday?: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  byMonthDay?: number[]; // Day of month (1-31)
  byMonth?: number[]; // Month (1-12)
  endDate?: Date; // End by date
  count?: number; // End after N occurrences
  timezone?: string; // IANA timezone
}

export interface Occurrence {
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
}

/**
 * Parse RRULE string to RecurrenceRule object
 * Supports basic RRULE format: FREQ=DAILY;INTERVAL=2;BYDAY=MO,WE,FR;UNTIL=20241231T235959Z;COUNT=10
 */
export function parseRRULE(rrule: string, dtstart: Date): RecurrenceRule {
  const rule: RecurrenceRule = {
    frequency: "DAILY",
    interval: 1,
  };

  const parts = rrule.split(";");
  
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (!key || !value) continue;
    
    switch (key) {
      case "FREQ":
        rule.frequency = value as RecurrenceRule["frequency"];
        break;
      case "INTERVAL":
        rule.interval = parseInt(value, 10) || 1;
        break;
      case "BYDAY":
        // Convert day abbreviations to numbers (SU=0, MO=1, ..., SA=6)
        const dayMap: Record<string, number> = {
          SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
        };
        rule.byWeekday = value.split(",").map(d => dayMap[d.trim()]).filter(d => d !== undefined);
        break;
      case "BYMONTHDAY":
        rule.byMonthDay = value.split(",").map(d => parseInt(d, 10));
        break;
      case "BYMONTH":
        rule.byMonth = value.split(",").map(m => parseInt(m, 10));
        break;
      case "UNTIL":
        if (value) {
          rule.endDate = new Date(value);
        }
        break;
      case "COUNT":
        rule.count = parseInt(value, 10);
        break;
    }
  }

  return rule;
}

/**
 * Convert RecurrenceRule to RRULE string
 */
export function toRRULE(rule: RecurrenceRule): string {
  const parts: string[] = [`FREQ=${rule.frequency}`];
  
  if (rule.interval && rule.interval > 1) {
    parts.push(`INTERVAL=${rule.interval}`);
  }
  
  if (rule.byWeekday && rule.byWeekday.length > 0) {
    const dayMap: Record<number, string> = {
      0: "SU", 1: "MO", 2: "TU", 3: "WE", 4: "TH", 5: "FR", 6: "SA",
    };
    parts.push(`BYDAY=${rule.byWeekday.map(d => dayMap[d]).join(",")}`);
  }
  
  if (rule.byMonthDay && rule.byMonthDay.length > 0) {
    parts.push(`BYMONTHDAY=${rule.byMonthDay.join(",")}`);
  }
  
  if (rule.byMonth && rule.byMonth.length > 0) {
    parts.push(`BYMONTH=${rule.byMonth.join(",")}`);
  }
  
  if (rule.endDate) {
    parts.push(`UNTIL=${rule.endDate.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`);
  }
  
  if (rule.count) {
    parts.push(`COUNT=${rule.count}`);
  }
  
  return parts.join(";");
}

/**
 * Generate occurrences for a recurrence rule within a date range
 */
export function generateOccurrences(
  masterStart: Date,
  masterEnd: Date,
  rule: RecurrenceRule,
  startRange: Date,
  endRange: Date,
  timezone?: string
): Occurrence[] {
  const occurrences: Occurrence[] = [];
  const duration = masterEnd.getTime() - masterStart.getTime();
  
  let currentDate = new Date(masterStart);
  let occurrenceCount = 0;
  const maxOccurrences = rule.count || 10000; // Safety limit
  
  // Check if we should start generating
  while (isBefore(currentDate, endRange) && occurrenceCount < maxOccurrences) {
    // Check end conditions
    if (rule.endDate && isAfter(currentDate, rule.endDate)) {
      break;
    }
    
    // Check if this occurrence matches the pattern
    if (matchesRecurrencePattern(currentDate, masterStart, rule)) {
      // Check if it's within the requested range
      if (isAfter(currentDate, startRange) || isSameDay(currentDate, startRange)) {
        const occurrenceEnd = new Date(currentDate.getTime() + duration);
        occurrences.push({
          startTime: new Date(currentDate),
          endTime: occurrenceEnd,
          isAllDay: false, // Can be overridden
        });
      }
      occurrenceCount++;
    }
    
    // Move to next potential occurrence based on frequency
    currentDate = getNextOccurrenceDate(currentDate, masterStart, rule);
    
    // Safety check to prevent infinite loops
    if (occurrenceCount > 10000) {
      break;
    }
  }
  
  return occurrences;
}

/**
 * Check if a date matches the recurrence pattern
 */
function matchesRecurrencePattern(date: Date, masterStart: Date, rule: RecurrenceRule): boolean {
  // Check weekday filter
  if (rule.byWeekday && rule.byWeekday.length > 0) {
    const dayOfWeek = getDay(date);
    if (!rule.byWeekday.includes(dayOfWeek)) {
      return false;
    }
  }
  
  // Check month day filter
  if (rule.byMonthDay && rule.byMonthDay.length > 0) {
    const dayOfMonth = date.getDate();
    if (!rule.byMonthDay.includes(dayOfMonth)) {
      return false;
    }
  }
  
  // Check month filter
  if (rule.byMonth && rule.byMonth.length > 0) {
    const month = date.getMonth() + 1; // getMonth() returns 0-11
    if (!rule.byMonth.includes(month)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get the next potential occurrence date based on frequency
 */
function getNextOccurrenceDate(currentDate: Date, masterStart: Date, rule: RecurrenceRule): Date {
  const interval = rule.interval || 1;
  
  switch (rule.frequency) {
    case "DAILY":
      return addDays(currentDate, interval);
    
    case "WEEKLY":
      return addWeeks(currentDate, interval);
    
    case "MONTHLY":
      return addMonths(currentDate, interval);
    
    case "YEARLY":
      return addYears(currentDate, interval);
    
    default:
      return addDays(currentDate, 1);
  }
}

/**
 * Apply exceptions to occurrences (exclude deleted, override modified, include added)
 */
export function applyExceptions(
  occurrences: Occurrence[],
  exceptions: Array<{
    occurrenceDate: Date;
    type: "MODIFIED" | "DELETED" | "ADDED";
    startTime?: Date;
    endTime?: Date;
    title?: string;
    description?: string;
    location?: string;
    isAllDay?: boolean;
    color?: string;
    [key: string]: any;
  }>
): Occurrence[] {
  const result: Occurrence[] = [];
  const exceptionMap = new Map<string, typeof exceptions[0]>();
  
  // Index exceptions by date
  for (const exc of exceptions) {
    const key = format(exc.occurrenceDate, "yyyy-MM-dd");
    exceptionMap.set(key, exc);
  }
  
  // Process occurrences
  for (const occ of occurrences) {
    const key = format(occ.startTime, "yyyy-MM-dd");
    const exception = exceptionMap.get(key);
    
    if (!exception) {
      // No exception, include as-is
      result.push(occ);
    } else if (exception.type === "DELETED" || exception.isDeleted) {
      // Excluded, skip
      continue;
    } else if (exception.type === "MODIFIED") {
      // Override with exception data
      result.push({
        startTime: exception.startTime || occ.startTime,
        endTime: exception.endTime || occ.endTime,
        isAllDay: exception.isAllDay !== undefined ? exception.isAllDay : occ.isAllDay,
      });
    }
  }
  
  // Add custom added dates
  for (const exc of exceptions) {
    if (exc.type === "ADDED" && exc.startTime && exc.endTime) {
      result.push({
        startTime: exc.startTime,
        endTime: exc.endTime,
        isAllDay: exc.isAllDay || false,
      });
    }
  }
  
  // Sort by start time
  return result.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

/**
 * Find the occurrence date for a given instance date
 */
export function findOccurrenceDate(masterStart: Date, instanceDate: Date, rule: RecurrenceRule): Date | null {
  // For simple patterns, calculate which occurrence this is
  const interval = rule.interval || 1;
  const daysDiff = Math.floor((instanceDate.getTime() - masterStart.getTime()) / (1000 * 60 * 60 * 24));
  
  switch (rule.frequency) {
    case "DAILY":
      if (daysDiff % interval === 0) {
        return new Date(masterStart.getTime() + daysDiff * 24 * 60 * 60 * 1000);
      }
      break;
    
    case "WEEKLY":
      const weeksDiff = Math.floor(daysDiff / 7);
      if (weeksDiff % interval === 0 && matchesRecurrencePattern(instanceDate, masterStart, rule)) {
        return instanceDate;
      }
      break;
    
    // For monthly and yearly, check if it matches the pattern
    default:
      if (matchesRecurrencePattern(instanceDate, masterStart, rule)) {
        return instanceDate;
      }
  }
  
  return null;
}

/**
 * Split a recurrence series at a given date
 * Returns the new end date for the original series and the start date for the new series
 */
export function splitRecurrenceSeries(
  masterStart: Date,
  splitDate: Date,
  rule: RecurrenceRule
): { originalEndDate: Date; newSeriesStart: Date } {
  // The original series ends the day before the split date
  const originalEndDate = new Date(splitDate);
  originalEndDate.setDate(originalEndDate.getDate() - 1);
  
  // The new series starts on the split date
  const newSeriesStart = new Date(splitDate);
  
  return { originalEndDate, newSeriesStart };
}

