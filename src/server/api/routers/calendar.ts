import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { 
  getCalendarEvents, 
  createCalendarEvent, 
  updateCalendarEvent, 
  deleteCalendarEvent,
  syncCalendars 
} from "@/lib/calendar-utils";
import { db } from "@/server/db";

export const calendarRouter = createTRPCRouter({
  // Get user's calendars from database
  getUserCalendars: protectedProcedure
    .query(async ({ ctx }) => {
      const calendars = await db.calendar.findMany({
        where: {
          account: {
            userId: ctx.auth.id,
          },
        },
        include: {
          account: {
            select: {
              id: true,
              emailAddress: true,
              name: true,
            },
          },
        },
        orderBy: [
          { isPrimary: "desc" },
          { name: "asc" },
        ],
      });

      return calendars;
    }),

  // Get calendars for a specific account
  getCalendarsByAccount: protectedProcedure
    .input(z.object({
      accountId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify the account belongs to the user
      const account = await db.account.findFirst({
        where: {
          id: input.accountId,
          userId: ctx.auth.id,
        },
      });

      if (!account) {
        throw new Error("Account not found or access denied");
      }

      const calendars = await db.calendar.findMany({
        where: {
          accountId: input.accountId,
        },
        include: {
          account: {
            select: {
              id: true,
              emailAddress: true,
              name: true,
            },
          },
        },
        orderBy: [
          { isPrimary: "desc" },
          { name: "asc" },
        ],
      });

      return calendars;
    }),

  // Sync calendars for an account
  syncCalendars: protectedProcedure
    .input(z.object({
      accountId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Verify account belongs to user
      const account = await ctx.db.account.findFirst({
        where: {
          id: input.accountId,
          userId: ctx.auth.id,
        },
      });

      if (!account) {
        throw new Error("Account not found or access denied");
      }

      try {
        await syncCalendars(input.accountId);
        return { success: true };
      } catch (error) {
        console.error("Error syncing calendars:", error);
        
        // Provide more specific error messages
        if (error instanceof Error) {
          // If the error already has a helpful message, use it
          if (error.message.includes("Calendar access not available") ||
              error.message.includes("calendar permissions") ||
              error.message.includes("re-authorize")) {
            throw error;
          }
        }
        
        throw new Error(`Failed to sync calendars: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }),

  // Get events for a calendar
  getCalendarEvents: protectedProcedure
    .input(z.object({
      accountId: z.string(),
      calendarId: z.string(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      try {
        const events = await getCalendarEvents(
          input.accountId,
          input.calendarId,
          input.startDate,
          input.endDate
        );
        return events;
      } catch (error) {
        console.error("Error fetching calendar events:", error);
        throw new Error("Failed to fetch calendar events");
      }
    }),

  // Create a new calendar event
  createEvent: protectedProcedure
    .input(z.object({
      accountId: z.string(),
      calendarId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      location: z.string().optional(),
      startTime: z.string(),
      endTime: z.string(),
      isAllDay: z.boolean().default(false),
      color: z.string().optional(),
      attendees: z.array(z.object({
        email: z.string(),
        name: z.string().optional(),
      })).optional(),
      recurrence: z.string().optional(),
      meetingUrl: z.string().optional(),
      reminders: z.array(z.object({
        method: z.string(),
        minutes: z.number(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Get the calendar to ensure we have the color available
        const calendar = await db.calendar.findFirst({
          where: {
            aurinkoCalendarId: input.calendarId,
            account: {
              id: input.accountId,
              userId: ctx.auth.id,
            },
          },
          select: { color: true },
        });

        // Ensure color is always set
        const eventColor = (input.color && input.color.trim() !== "") 
          ? input.color 
          : (calendar?.color && calendar.color.trim() !== "") 
            ? calendar.color 
            : "sky";

        const event = await createCalendarEvent(
          input.accountId,
          input.calendarId,
          {
            title: input.title,
            description: input.description,
            location: input.location,
            startTime: input.startTime,
            endTime: input.endTime,
            isAllDay: input.isAllDay,
            color: eventColor,
            attendees: input.attendees,
            recurrence: input.recurrence,
            meetingUrl: input.meetingUrl,
            reminders: input.reminders,
          }
        );
        return event;
      } catch (error) {
        console.error("Error creating calendar event:", error);
        throw new Error("Failed to create calendar event");
      }
    }),

  // Update a calendar event
  updateEvent: protectedProcedure
    .input(z.object({
      accountId: z.string(),
      calendarId: z.string(),
      eventId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      isAllDay: z.boolean().optional(),
      color: z.string().optional(),
      attendees: z.array(z.object({
        email: z.string(),
        name: z.string().optional(),
      })).optional(),
      recurrence: z.string().optional(),
      meetingUrl: z.string().optional(),
      reminders: z.array(z.object({
        method: z.string(),
        minutes: z.number(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const { accountId, calendarId, eventId, ...eventData } = input;
        
        // If color is being updated, ensure it's valid
        if (eventData.color !== undefined) {
          const calendar = await db.calendar.findFirst({
            where: {
              aurinkoCalendarId: calendarId,
              account: {
                id: accountId,
                userId: ctx.auth.id,
              },
            },
            select: { color: true },
          });
          
          // Ensure color is valid - use provided, calendar, or default
          eventData.color = (eventData.color && eventData.color.trim() !== "") 
            ? eventData.color 
            : (calendar?.color && calendar.color.trim() !== "") 
              ? calendar.color 
              : "sky";
        }
        
        const event = await updateCalendarEvent(
          accountId,
          calendarId,
          eventId,
          eventData
        );
        return event;
      } catch (error) {
        console.error("Error updating calendar event:", error);
        throw new Error("Failed to update calendar event");
      }
    }),

  // Delete a calendar event
  deleteEvent: protectedProcedure
    .input(z.object({
      accountId: z.string(),
      calendarId: z.string(),
      eventId: z.string(),
    }))
    .mutation(async ({ input }) => {
      try {
        await deleteCalendarEvent(
          input.accountId,
          input.calendarId,
          input.eventId
        );
        return { success: true };
      } catch (error) {
        console.error("Error deleting calendar event:", error);
        throw new Error("Failed to delete calendar event");
      }
    }),

  // Get upcoming events across all user calendars (both provider and database events)
  getUpcomingEvents: protectedProcedure
    .input(z.object({
      days: z.number().default(7), // Number of days to look ahead
      includePast: z.boolean().optional().default(false), // Include past events
      calendarId: z.string().optional(), // Optional calendar ID to filter by
      accountId: z.string().optional(), // Optional account ID to filter by
    }))
    .query(async ({ ctx, input }) => {
      try {
        const now = new Date();
        const startDate = input.includePast 
          ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
          : now;
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + input.days);

        const userCalendars = await db.calendar.findMany({
          where: {
            account: {
              userId: ctx.auth.id,
              ...(input.accountId ? { id: input.accountId } : {}),
            },
            ...(input.calendarId ? { id: input.calendarId } : {}),
          },
          include: {
            account: {
              select: {
                id: true,
                emailAddress: true,
              },
            },
          },
        });

        const allEvents = [];

        // Fetch provider events (from Aurinko) for calendars with aurinkoCalendarId
        for (const calendar of userCalendars) {
          if (calendar.aurinkoCalendarId) {
            try {
              const events = await getCalendarEvents(
                calendar.account.id,
                calendar.aurinkoCalendarId,
                startDate.toISOString(),
                endDate.toISOString()
              );

              allEvents.push(
                ...events.map(event => ({
                  ...event,
                  color: (event as any).color || calendar.color || "sky",
                  calendarName: calendar.name,
                  calendarColor: calendar.color,
                  accountEmail: calendar.account.emailAddress,
                  accountId: calendar.account.id,
                  calendarId: calendar.aurinkoCalendarId,
                  isProviderEvent: true, // Flag to indicate this is from provider
                }))
              );
            } catch (error) {
              console.error(`Error fetching provider events for calendar ${calendar.id}:`, error);
              // Continue with other calendars even if one fails
            }
          }
        }

        // Fetch database events
        const calendarIds = userCalendars.map(c => c.id);
        if (calendarIds.length > 0) {
          const dbEvents = await db.calendarEvent.findMany({
            where: {
              calendarId: input.calendarId 
                ? input.calendarId 
                : { in: calendarIds },
              startTime: {
                gte: startDate,
                lte: endDate,
              },
            },
            include: {
              calendar: {
                include: {
                  account: {
                    select: {
                      id: true,
                      emailAddress: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              startTime: "asc",
            },
          });

          // Convert database events to the same format as provider events
          allEvents.push(
            ...dbEvents.map(event => {
              // Ensure color is never null - use event color, calendar color, or default
              const eventColor = (event.color && event.color.trim() !== "") 
                ? event.color 
                : (event.calendar.color && event.calendar.color.trim() !== "") 
                  ? event.calendar.color 
                  : "sky";
              
              return {
                id: event.id,
                title: event.title,
                description: event.description || undefined,
                location: event.location || undefined,
                startTime: event.startTime.toISOString(),
                endTime: event.endTime.toISOString(),
                isAllDay: event.isAllDay,
                color: eventColor,
                calendarName: event.calendar.name,
                calendarColor: event.calendar.color,
                accountEmail: event.calendar.account.emailAddress,
                accountId: event.calendar.account.id,
                calendarId: event.calendar.aurinkoCalendarId,
                isDbEvent: true, // Flag to indicate this is a database event
                aurinkoEventId: event.aurinkoEventId || null, // Provider event ID if synced
                dbCalendarId: event.calendarId, // Database calendar ID
              };
            })
          );
        }

        // Sort events by start time
        return allEvents.sort((a, b) => 
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
      } catch (error) {
        console.error("Error fetching upcoming events:", error);
        throw new Error("Failed to fetch upcoming events");
      }
    }),

  // Get all user events from database
  getDbEvents: protectedProcedure.query(async ({ ctx }) => {
    try {
      const userCalendars = await db.calendar.findMany({
        where: {
          account: {
            userId: ctx.auth.id,
          },
        },
        select: {
          id: true,
        },
      });

      const events = await db.calendarEvent.findMany({
        where: {
          calendarId: {
            in: userCalendars.map((c) => c.id),
          },
        },
        include: {
          calendar: {
            include: {
              account: {
                select: {
                  emailAddress: true,
                },
              },
            },
          },
        },
        orderBy: {
          startTime: "asc",
        },
      });

      return events.map((event) => ({
        id: event.id,
        title: event.title,
        description: event.description,
        location: event.location,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        isAllDay: event.isAllDay,
        calendarName: event.calendar.name,
        calendarColor: event.calendar.color,
        accountEmail: event.calendar.account.emailAddress,
        color: event.calendar.color || "sky",
      }));
    } catch (error) {
      console.error("Error fetching events:", error);
      throw new Error("Failed to fetch events");
    }
  }),

  // Create a new event in database
  createDbEvent: protectedProcedure
    .input(
      z.object({
        calendarId: z.string(),
        title: z.string(),
        description: z.string().optional(),
        location: z.string().optional(),
        startTime: z.string(),
        endTime: z.string(),
        isAllDay: z.boolean().default(false),
        color: z.string().optional(),
        recurrence: z.any().optional(),
        attendees: z.any().optional(),
        meetingUrl: z.string().optional(),
        reminders: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify the calendar belongs to the user
        const calendar = await db.calendar.findFirst({
          where: {
            id: input.calendarId,
            account: {
              userId: ctx.auth.id,
            },
          },
        });

        if (!calendar) {
          throw new Error("Calendar not found");
        }

        // Ensure color is always set - use provided color, calendar color, or default
        const eventColor = (input.color && input.color.trim() !== "") 
          ? input.color 
          : (calendar.color && calendar.color.trim() !== "") 
            ? calendar.color 
            : "sky";

        const event = await db.calendarEvent.create({
          data: {
            calendarId: input.calendarId,
            title: input.title,
            description: input.description || null,
            location: input.location || null,
            startTime: new Date(input.startTime),
            endTime: new Date(input.endTime),
            isAllDay: input.isAllDay,
            color: eventColor,
            recurrence: input.recurrence || null,
            attendees: input.attendees || null,
            meetingUrl: input.meetingUrl || null,
            reminders: input.reminders || null,
          },
        });

        return event;
      } catch (error) {
        console.error("Error creating event:", error);
        throw new Error("Failed to create event");
      }
    }),

  // Update an event in database
  updateDbEvent: protectedProcedure
    .input(
      z.object({
        eventId: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        isAllDay: z.boolean().optional(),
        color: z.string().optional(),
        recurrence: z.any().optional(),
        attendees: z.any().optional(),
        meetingUrl: z.string().optional(),
        reminders: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { eventId, ...updateData } = input;

        // Verify the event belongs to the user's calendar
        const event = await db.calendarEvent.findFirst({
          where: {
            id: eventId,
            calendar: {
              account: {
                userId: ctx.auth.id,
              },
            },
          },
          include: {
            calendar: {
              select: {
                color: true,
              },
            },
          },
        });

        if (!event) {
          throw new Error("Event not found");
        }

        const updatedData: any = {};
        if (updateData.title !== undefined) updatedData.title = updateData.title;
        if (updateData.description !== undefined)
          updatedData.description = updateData.description;
        if (updateData.location !== undefined) updatedData.location = updateData.location;
        if (updateData.startTime !== undefined)
          updatedData.startTime = new Date(updateData.startTime);
        if (updateData.endTime !== undefined)
          updatedData.endTime = new Date(updateData.endTime);
        if (updateData.isAllDay !== undefined) updatedData.isAllDay = updateData.isAllDay;
        
        // Handle color: ensure it's always set to a valid value
        if (updateData.color !== undefined) {
          // If color is provided, use it if it's not empty, otherwise use calendar color or default
          updatedData.color = (updateData.color && updateData.color.trim() !== "")
            ? updateData.color
            : (event.calendar.color && event.calendar.color.trim() !== "")
              ? event.calendar.color
              : "sky";
        } else if (!event.color || event.color.trim() === "") {
          // If color is not provided and event doesn't have a valid color, use calendar's color or default
          updatedData.color = (event.calendar.color && event.calendar.color.trim() !== "")
            ? event.calendar.color
            : "sky";
        }
        
        if (updateData.recurrence !== undefined) updatedData.recurrence = updateData.recurrence;
        if (updateData.attendees !== undefined) updatedData.attendees = updateData.attendees;
        if (updateData.meetingUrl !== undefined) updatedData.meetingUrl = updateData.meetingUrl;
        if (updateData.reminders !== undefined) updatedData.reminders = updateData.reminders;

        const updatedEvent = await db.calendarEvent.update({
          where: {
            id: eventId,
          },
          data: updatedData,
        });

        return updatedEvent;
      } catch (error) {
        console.error("Error updating event:", error);
        throw new Error("Failed to update event");
      }
    }),

  // Delete an event from database
  deleteDbEvent: protectedProcedure
    .input(
      z.object({
        eventId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify the event belongs to the user's calendar
        const event = await db.calendarEvent.findFirst({
          where: {
            id: input.eventId,
            calendar: {
              account: {
                userId: ctx.auth.id,
              },
            },
          },
        });

        if (!event) {
          throw new Error("Event not found");
        }

        await db.calendarEvent.delete({
          where: {
            id: input.eventId,
          },
        });

        return { success: true };
      } catch (error) {
        console.error("Error deleting event:", error);
        throw new Error("Failed to delete event");
      }
    }),

  // Create a new calendar without syncing
  createCalendar: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        color: z.string().optional(),
        isPrimary: z.boolean().optional(),
        accountId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const accountId = input.accountId
        ? input.accountId
        : (
            await ctx.db.account.findFirst({
              where: { userId: ctx.auth.id },
              select: { id: true },
            })
          )?.id;

      if (!accountId) {
        throw new Error("No account found to attach the calendar to");
      }

      const calendar = await ctx.db.calendar.create({
        data: {
          accountId,
          name: input.name,
          description: input.description ?? null,
          color: input.color ?? "#3b82f6",
          isPrimary: input.isPrimary ?? false,
          // aurinkoCalendarId intentionally left null; can be set later via sync
        },
      });

      return calendar;
    }),

  // Fix existing events with null colors (one-time migration)
  fixEventColors: protectedProcedure
    .mutation(async ({ ctx }) => {
      try {
        // Get all calendars for the user
        const userCalendars = await db.calendar.findMany({
          where: {
            account: {
              userId: ctx.auth.id,
            },
          },
          select: {
            id: true,
            color: true,
          },
        });

        let fixedCount = 0;

        // Fix events with null or empty colors for each calendar
        for (const calendar of userCalendars) {
          const calendarColor = (calendar.color && calendar.color.trim() !== "") 
            ? calendar.color 
            : "sky";

          const result = await db.calendarEvent.updateMany({
            where: {
              calendarId: calendar.id,
              OR: [
                { color: null },
                { color: "" },
              ],
            },
            data: {
              color: calendarColor,
            },
          });

          fixedCount += result.count;
        }

        return { fixedCount };
      } catch (error) {
        console.error("Error fixing event colors:", error);
        throw new Error("Failed to fix event colors");
      }
    }),
});

