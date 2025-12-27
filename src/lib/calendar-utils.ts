"use server";
import axios from "axios";
import { db } from "@/server/db";
import { getValidToken } from "./token-refresh";

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  color?: string;
  attendees?: Array<{
    email: string;
    name?: string;
    responseStatus?: string;
  }>;
  recurrence?: string;
  meetingUrl?: string;
  reminders?: Array<{
    method: string;
    minutes: number;
  }>;
}

export interface Calendar {
  id: string;
  name: string;
  description?: string;
  color?: string;
  isPrimary: boolean;
  isReadOnly: boolean;
}

/**
 * Get calendars for an account
 */
export async function getCalendars(accountId: string): Promise<Calendar[]> {
  try {
    const token = await getValidToken(accountId);
    if (!token) {
      throw new Error("No valid token available");
    }

    const response = await axios.get("https://api.aurinko.io/v1/calendar/calendars", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data.map((calendar: any) => ({
      id: calendar.id,
      name: calendar.name,
      description: calendar.description,
      color: calendar.color,
      isPrimary: calendar.isPrimary || false,
      isReadOnly: calendar.isReadOnly || false,
    }));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorData = error.response?.data;
      
      console.error("Error fetching calendars:", errorData);
      
      // Provide more specific error messages
      if (status === 404) {
        const errorMessage = errorData?.message || errorData?.code || "notFound";
        if (errorMessage === "notFound" || errorMessage.includes("notFound")) {
          throw new Error("Calendar access not available. This account may not have calendar permissions. Please re-authorize your account with calendar access enabled.");
        }
        throw new Error(`Calendar endpoint not found: ${errorMessage}`);
      } else if (status === 401 || status === 403) {
        throw new Error("Calendar access denied. Please re-authorize your account with calendar permissions.");
      } else {
        const errorMessage = errorData?.message || error.message || "Unknown error";
        throw new Error(`Failed to fetch calendars: ${errorMessage}`);
      }
    } else {
      console.error("Unexpected error fetching calendars:", error);
      throw error;
    }
  }
}

/**
 * Get events for a calendar
 */
export async function getCalendarEvents(
  accountId: string,
  calendarId: string,
  startDate?: string,
  endDate?: string
): Promise<CalendarEvent[]> {
  try {
    const token = await getValidToken(accountId);
    if (!token) {
      throw new Error("No valid token available");
    }

    const params: any = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const response = await axios.get(
      `https://api.aurinko.io/v1/calendar/calendars/${calendarId}/events`,
      {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response.data.map((event: any) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      startTime: event.startTime,
      endTime: event.endTime,
      isAllDay: event.isAllDay || false,
      color: event.color || undefined, // Extract color from provider response
      attendees: event.attendees,
      recurrence: event.recurrence,
      meetingUrl: event.meetingUrl,
      reminders: event.reminders,
    }));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Error fetching calendar events:", error.response?.data);
    } else {
      console.error("Unexpected error fetching calendar events:", error);
    }
    throw error;
  }
}

/**
 * Create a new calendar event
 */
export async function createCalendarEvent(
  accountId: string,
  calendarId: string,
  eventData: Omit<CalendarEvent, "id">
): Promise<CalendarEvent> {
  try {
    const token = await getValidToken(accountId);
    if (!token) {
      throw new Error("No valid token available");
    }

    const response = await axios.post(
      `https://api.aurinko.io/v1/calendar/calendars/${calendarId}/events`,
      eventData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return {
      id: response.data.id,
      title: response.data.title,
      description: response.data.description,
      location: response.data.location,
      startTime: response.data.startTime,
      endTime: response.data.endTime,
      isAllDay: response.data.isAllDay || false,
      color: response.data.color || undefined, // Extract color from provider response
      attendees: response.data.attendees,
      recurrence: response.data.recurrence,
      meetingUrl: response.data.meetingUrl,
      reminders: response.data.reminders,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Error creating calendar event:", error.response?.data);
    } else {
      console.error("Unexpected error creating calendar event:", error);
    }
    throw error;
  }
}

/**
 * Update a calendar event
 */
export async function updateCalendarEvent(
  accountId: string,
  calendarId: string,
  eventId: string,
  eventData: Partial<Omit<CalendarEvent, "id">>
): Promise<CalendarEvent> {
  try {
    const token = await getValidToken(accountId);
    if (!token) {
      throw new Error("No valid token available");
    }

    const response = await axios.put(
      `https://api.aurinko.io/v1/calendar/calendars/${calendarId}/events/${eventId}`,
      eventData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return {
      id: response.data.id,
      title: response.data.title,
      description: response.data.description,
      location: response.data.location,
      startTime: response.data.startTime,
      endTime: response.data.endTime,
      isAllDay: response.data.isAllDay || false,
      color: response.data.color || undefined, // Extract color from provider response
      attendees: response.data.attendees,
      recurrence: response.data.recurrence,
      meetingUrl: response.data.meetingUrl,
      reminders: response.data.reminders,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Error updating calendar event:", error.response?.data);
    } else {
      console.error("Unexpected error updating calendar event:", error);
    }
    throw error;
  }
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(
  accountId: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  try {
    const token = await getValidToken(accountId);
    if (!token) {
      throw new Error("No valid token available");
    }

    await axios.delete(
      `https://api.aurinko.io/v1/calendar/calendars/${calendarId}/events/${eventId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Error deleting calendar event:", error.response?.data);
    } else {
      console.error("Unexpected error deleting calendar event:", error);
    }
    throw error;
  }
}

/**
 * Sync calendars for an account
 */
export async function syncCalendars(accountId: string): Promise<void> {
  try {
    // Get calendars from Aurinko
    const aurinkoCalendars = await getCalendars(accountId);
    
    // Get existing calendars from database
    const existingCalendars = await db.calendar.findMany({
      where: { accountId },
      select: { id: true, aurinkoCalendarId: true, name: true },
    });

    // Create a map of existing calendars by Aurinko ID
    const existingCalendarMap = new Map(
      existingCalendars.map(cal => [cal.aurinkoCalendarId, cal])
    );

    // Process each calendar
    for (const aurinkoCalendar of aurinkoCalendars) {
      const existingCalendar = existingCalendarMap.get(aurinkoCalendar.id);
      
      if (existingCalendar) {
        // Update existing calendar
        await db.calendar.update({
          where: { id: existingCalendar.id },
          data: {
            name: aurinkoCalendar.name,
            description: aurinkoCalendar.description,
            color: aurinkoCalendar.color,
            isPrimary: aurinkoCalendar.isPrimary,
            isReadOnly: aurinkoCalendar.isReadOnly,
            lastSyncAt: new Date(),
          },
        });
      } else {
        // Create new calendar
        await db.calendar.create({
          data: {
            accountId,
            name: aurinkoCalendar.name,
            description: aurinkoCalendar.description,
            color: aurinkoCalendar.color,
            isPrimary: aurinkoCalendar.isPrimary,
            isReadOnly: aurinkoCalendar.isReadOnly,
            aurinkoCalendarId: aurinkoCalendar.id,
            lastSyncAt: new Date(),
          },
        });
      }
    }

    // Remove calendars that no longer exist in Aurinko
    const aurinkoCalendarIds = new Set(aurinkoCalendars.map(cal => cal.id));
    const calendarsToRemove = existingCalendars.filter(
      cal => cal.aurinkoCalendarId && !aurinkoCalendarIds.has(cal.aurinkoCalendarId)
    );

    for (const calendar of calendarsToRemove) {
      await db.calendar.delete({
        where: { id: calendar.id },
      });
    }
  } catch (error) {
    console.error("Error syncing calendars:", error);
    
    // Re-throw with improved error message if it's about calendar access
    if (error instanceof Error) {
      if (error.message.includes("Calendar access not available") || 
          error.message.includes("calendar permissions") ||
          error.message.includes("Calendar endpoint not found")) {
        throw error; // Already has a good message
      }
    }
    
    // For other errors, provide a generic but helpful message
    throw new Error(`Failed to sync calendars: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

