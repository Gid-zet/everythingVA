/**
 * Recurring events management utilities
 * Handles master events, occurrences, exceptions, and series operations
 */

import { db } from "@/server/db";
import { parseRRULE, generateOccurrences, applyExceptions, splitRecurrenceSeries, type RecurrenceRule } from "./recurrence";
import { isBefore, isAfter, startOfDay, format } from "date-fns";

export interface EventOccurrence {
  id: string;
  startTime: Date;
  endTime: Date;
  title: string;
  description?: string;
  location?: string;
  color?: string;
  isAllDay: boolean;
  isException?: boolean;
  masterEventId?: string;
}

/**
 * Get all occurrences for a master event within a date range
 */
export async function getEventOccurrences(
  masterEventId: string,
  startRange: Date,
  endRange: Date
): Promise<EventOccurrence[]> {
  const masterEvent = await db.calendarEvent.findUnique({
    where: { id: masterEventId },
    include: { exceptions: true },
  });

  if (!masterEvent || !masterEvent.isRecurring || !masterEvent.recurrence) {
    return [];
  }

  // Parse recurrence rule
  const rule = parseRRULE(JSON.stringify(masterEvent.recurrence), masterEvent.startTime);
  
  // Set end date from recurrenceEndDate or recurrenceCount
  if (masterEvent.recurrenceEndDate) {
    rule.endDate = masterEvent.recurrenceEndDate;
  } else if (masterEvent.recurrenceCount) {
    rule.count = masterEvent.recurrenceCount;
  }

  // Generate occurrences
  const generatedOccurrences = generateOccurrences(
    masterEvent.startTime,
    masterEvent.endTime,
    rule,
    startRange,
    endRange,
    masterEvent.timezone || undefined
  );

  // Get exceptions
  const exceptions = masterEvent.exceptions.map(exc => ({
    occurrenceDate: exc.occurrenceDate,
    type: exc.type as "MODIFIED" | "DELETED" | "ADDED",
    startTime: exc.startTime || undefined,
    endTime: exc.endTime || undefined,
    title: exc.title || undefined,
    description: exc.description || undefined,
    location: exc.location || undefined,
    isAllDay: exc.isAllDay || undefined,
    color: exc.color || undefined,
    isDeleted: exc.isDeleted,
  }));

  // Apply exceptions
  const occurrences = applyExceptions(generatedOccurrences, exceptions);

  // Convert to EventOccurrence format
  return occurrences.map(occ => ({
    id: `${masterEventId}-${format(occ.startTime, "yyyy-MM-dd-HH-mm")}`,
    startTime: occ.startTime,
    endTime: occ.endTime,
    title: masterEvent.title,
    description: masterEvent.description || undefined,
    location: masterEvent.location || undefined,
    color: masterEvent.color || undefined,
    isAllDay: occ.isAllDay,
    masterEventId: masterEventId,
    isException: exceptions.some(exc => 
      format(exc.occurrenceDate, "yyyy-MM-dd") === format(occ.startTime, "yyyy-MM-dd") &&
      exc.type === "MODIFIED"
    ),
  }));
}

/**
 * Get a single occurrence with all overrides applied
 */
export async function getEventOccurrence(
  masterEventId: string,
  occurrenceDate: Date
): Promise<EventOccurrence | null> {
  const masterEvent = await db.calendarEvent.findUnique({
    where: { id: masterEventId },
    include: { exceptions: true },
  });

  if (!masterEvent || !masterEvent.isRecurring) {
    return null;
  }

  // Check for exception
  const exception = masterEvent.exceptions.find(exc =>
    format(exc.occurrenceDate, "yyyy-MM-dd") === format(occurrenceDate, "yyyy-MM-dd")
  );

  if (exception) {
    if (exception.type === "DELETED" || exception.isDeleted) {
      return null; // This occurrence was deleted
    }

    // Return modified occurrence
    return {
      id: `${masterEventId}-${format(occurrenceDate, "yyyy-MM-dd-HH-mm")}`,
      startTime: exception.startTime || occurrenceDate,
      endTime: exception.endTime || new Date(occurrenceDate.getTime() + (masterEvent.endTime.getTime() - masterEvent.startTime.getTime())),
      title: exception.title || masterEvent.title,
      description: exception.description ?? masterEvent.description ?? undefined,
      location: exception.location ?? masterEvent.location ?? undefined,
      color: exception.color ?? masterEvent.color ?? undefined,
      isAllDay: exception.isAllDay ?? masterEvent.isAllDay,
      masterEventId: masterEventId,
      isException: true,
    };
  }

  // Return standard occurrence
  const duration = masterEvent.endTime.getTime() - masterEvent.startTime.getTime();
  return {
    id: `${masterEventId}-${format(occurrenceDate, "yyyy-MM-dd-HH-mm")}`,
    startTime: occurrenceDate,
    endTime: new Date(occurrenceDate.getTime() + duration),
    title: masterEvent.title,
    description: masterEvent.description || undefined,
    location: masterEvent.location || undefined,
    color: masterEvent.color || undefined,
    isAllDay: masterEvent.isAllDay,
    masterEventId: masterEventId,
  };
}

/**
 * Edit a recurring event occurrence
 * editScope: "this" | "thisAndFuture" | "all"
 */
export async function editRecurringEvent(
  masterEventId: string,
  occurrenceDate: Date,
  updates: {
    title?: string;
    description?: string;
    location?: string;
    startTime?: Date;
    endTime?: Date;
    color?: string;
    isAllDay?: boolean;
    attendees?: any;
    meetingUrl?: string;
    reminders?: any;
  },
  editScope: "this" | "thisAndFuture" | "all"
): Promise<void> {
  const masterEvent = await db.calendarEvent.findUnique({
    where: { id: masterEventId },
  });

  if (!masterEvent || !masterEvent.isRecurring) {
    throw new Error("Event is not a recurring event");
  }

  if (editScope === "all") {
    // Update master event
    await db.calendarEvent.update({
      where: { id: masterEventId },
      data: {
        title: updates.title ?? masterEvent.title,
        description: updates.description ?? masterEvent.description,
        location: updates.location ?? masterEvent.location,
        startTime: updates.startTime ?? masterEvent.startTime,
        endTime: updates.endTime ?? masterEvent.endTime,
        color: updates.color ?? masterEvent.color,
        isAllDay: updates.isAllDay ?? masterEvent.isAllDay,
        attendees: updates.attendees ?? masterEvent.attendees,
        meetingUrl: updates.meetingUrl ?? masterEvent.meetingUrl,
        reminders: updates.reminders ?? masterEvent.reminders,
      },
    });
  } else if (editScope === "thisAndFuture") {
    // Split the series
    const { originalEndDate, newSeriesStart } = splitRecurrenceSeries(
      masterEvent.startTime,
      occurrenceDate,
      masterEvent.recurrence ? parseRRULE(JSON.stringify(masterEvent.recurrence), masterEvent.startTime) : {
        frequency: "DAILY",
        interval: 1,
      }
    );

    // Update original master to end before split date
    await db.calendarEvent.update({
      where: { id: masterEventId },
      data: {
        recurrenceEndDate: originalEndDate,
      },
    });

    // Create new master event starting from split date
    const duration = masterEvent.endTime.getTime() - masterEvent.startTime.getTime();
    const newEndTime = updates.endTime || new Date(newSeriesStart.getTime() + duration);

    await db.calendarEvent.create({
      data: {
        calendarId: masterEvent.calendarId,
        title: updates.title ?? masterEvent.title,
        description: updates.description ?? masterEvent.description,
        location: updates.location ?? masterEvent.location,
        startTime: updates.startTime || newSeriesStart,
        endTime: newEndTime,
        color: updates.color ?? masterEvent.color,
        isAllDay: updates.isAllDay ?? masterEvent.isAllDay,
        isRecurring: true,
        recurrence: masterEvent.recurrence,
        recurrenceEndDate: masterEvent.recurrenceEndDate,
        recurrenceCount: masterEvent.recurrenceCount,
        timezone: masterEvent.timezone,
        attendees: updates.attendees ?? masterEvent.attendees,
        meetingUrl: updates.meetingUrl ?? masterEvent.meetingUrl,
        reminders: updates.reminders ?? masterEvent.reminders,
        status: masterEvent.status,
      },
    });
  } else {
    // Edit this occurrence only - create exception
    await db.eventException.upsert({
      where: {
        eventId_occurrenceDate: {
          eventId: masterEventId,
          occurrenceDate: startOfDay(occurrenceDate),
        },
      },
      create: {
        eventId: masterEventId,
        type: "MODIFIED",
        occurrenceDate: startOfDay(occurrenceDate),
        title: updates.title,
        description: updates.description,
        location: updates.location,
        startTime: updates.startTime,
        endTime: updates.endTime,
        isAllDay: updates.isAllDay,
        color: updates.color,
        attendees: updates.attendees ? JSON.parse(JSON.stringify(updates.attendees)) : undefined,
        meetingUrl: updates.meetingUrl,
        reminders: updates.reminders ? JSON.parse(JSON.stringify(updates.reminders)) : undefined,
      },
      update: {
        type: "MODIFIED",
        title: updates.title,
        description: updates.description,
        location: updates.location,
        startTime: updates.startTime,
        endTime: updates.endTime,
        isAllDay: updates.isAllDay,
        color: updates.color,
        attendees: updates.attendees ? JSON.parse(JSON.stringify(updates.attendees)) : undefined,
        meetingUrl: updates.meetingUrl,
        reminders: updates.reminders ? JSON.parse(JSON.stringify(updates.reminders)) : undefined,
      },
    });
  }
}

/**
 * Delete a recurring event occurrence
 * deleteScope: "this" | "thisAndFuture" | "all"
 */
export async function deleteRecurringEvent(
  masterEventId: string,
  occurrenceDate: Date,
  deleteScope: "this" | "thisAndFuture" | "all"
): Promise<void> {
  const masterEvent = await db.calendarEvent.findUnique({
    where: { id: masterEventId },
  });

  if (!masterEvent || !masterEvent.isRecurring) {
    throw new Error("Event is not a recurring event");
  }

  if (deleteScope === "all") {
    // Delete master event and all exceptions
    await db.calendarEvent.delete({
      where: { id: masterEventId },
    });
  } else if (deleteScope === "thisAndFuture") {
    // Truncate recurrence at occurrence date
    const truncateDate = new Date(occurrenceDate);
    truncateDate.setDate(truncateDate.getDate() - 1);

    await db.calendarEvent.update({
      where: { id: masterEventId },
      data: {
        recurrenceEndDate: truncateDate,
      },
    });
  } else {
    // Delete this occurrence only - create exception
    await db.eventException.upsert({
      where: {
        eventId_occurrenceDate: {
          eventId: masterEventId,
          occurrenceDate: startOfDay(occurrenceDate),
        },
      },
      create: {
        eventId: masterEventId,
        type: "DELETED",
        occurrenceDate: startOfDay(occurrenceDate),
        isDeleted: true,
      },
      update: {
        type: "DELETED",
        isDeleted: true,
      },
    });
  }
}

/**
 * Add a custom date to a recurring event (outside RRULE pattern)
 */
export async function addCustomOccurrence(
  masterEventId: string,
  occurrenceDate: Date,
  endTime: Date,
  overrides?: {
    title?: string;
    description?: string;
    location?: string;
    color?: string;
    isAllDay?: boolean;
  }
): Promise<void> {
  const masterEvent = await db.calendarEvent.findUnique({
    where: { id: masterEventId },
  });

  if (!masterEvent || !masterEvent.isRecurring) {
    throw new Error("Event is not a recurring event");
  }

  await db.eventException.create({
    data: {
      eventId: masterEventId,
      type: "ADDED",
      occurrenceDate: startOfDay(occurrenceDate),
      startTime: occurrenceDate,
      endTime: endTime,
      title: overrides?.title,
      description: overrides?.description,
      location: overrides?.location,
      color: overrides?.color,
      isAllDay: overrides?.isAllDay,
    },
  });
}



