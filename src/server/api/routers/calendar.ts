import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { asTRPCError, getProviders } from "@/server/providers";
import { getEventsInRange, syncCalendarList } from "@/server/services/calendar-sync";
import { parseRRULE } from "@/lib/recurrence";

/**
 * Calendar API. Every procedure resolves calendars through
 * `account.userId = ctx.auth.id`, so ids from the client can never reach
 * another user's data. Provider calendars write through to Google/Microsoft;
 * local calendars write to the DB.
 */

const iso = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const eventInput = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(20_000).nullish(),
  location: z.string().max(1000).nullish(),
  start: iso,
  end: iso,
  allDay: z.boolean().default(false),
  timezone: z.string().min(1).max(100),
  attendees: z
    .array(z.object({ email: z.string().email(), name: z.string().nullish(), type: z.enum(["required", "optional"]).optional() }))
    .max(200)
    .optional(),
  recurrence: z.array(z.string().regex(/^(RRULE|EXDATE|RDATE):/)).max(10).nullish(),
  onlineMeeting: z.boolean().optional(),
  showAs: z.enum(["free", "busy", "tentative", "outOfOffice"]).optional(),
});

async function ownedCalendar(userId: string, calendarId: string) {
  const cal = await db.calendar.findFirst({
    where: { id: calendarId, account: { userId } },
    select: { id: true, accountId: true, aurinkoCalendarId: true, isReadOnly: true, name: true, color: true },
  });
  if (!cal) throw new TRPCError({ code: "NOT_FOUND", message: "Calendar not found" });
  return cal;
}

function assertWritable(cal: { isReadOnly: boolean; name: string }) {
  if (cal.isReadOnly) {
    throw new TRPCError({ code: "FORBIDDEN", message: `"${cal.name}" is read-only. Pick a calendar you can edit.` });
  }
}

/** Local events: RRULE → the JSON shape the existing recurrence engine stores. */
function localRecurrence(rules: string[] | null | undefined, start: Date) {
  const rrule = rules?.find((r) => r.startsWith("RRULE:"));
  if (!rrule) return { isRecurring: false, recurrence: undefined, recurrenceEndDate: null, recurrenceCount: null };
  const parsed = parseRRULE(rrule.replace(/^RRULE:/, ""), start);
  return {
    isRecurring: true,
    // Stored as the RRULE text; src/server/services/calendar-sync.ts expands it.
    recurrence: rrule,
    recurrenceEndDate: parsed.endDate ?? null,
    recurrenceCount: parsed.count ?? null,
  };
}

export const calendarRouter = createTRPCRouter({
  /** Accounts → calendars for the sidebar, plus a change "version" for polling. */
  overview: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await ctx.db.account.findMany({
      where: { userId: ctx.auth.id },
      select: {
        id: true,
        emailAddress: true,
        name: true,
        serviceType: true,
        status: true,
        statusMessage: true,
        calendars: {
          select: {
            id: true,
            name: true,
            color: true,
            isPrimary: true,
            isReadOnly: true,
            isVisible: true,
            aurinkoCalendarId: true,
            lastSyncAt: true,
          },
          orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const version = Math.max(
      0,
      ...accounts.flatMap((a) => a.calendars.map((c) => c.lastSyncAt?.getTime() ?? 0)),
    );
    return {
      version,
      accounts: accounts.map((a) => ({
        ...a,
        calendars: a.calendars.map(({ aurinkoCalendarId, lastSyncAt: _l, ...c }) => ({
          ...c,
          local: !aurinkoCalendarId,
        })),
      })),
    };
  }),

  /** Refresh calendar lists from the providers (all accounts, or one). */
  syncCalendars: protectedProcedure
    .input(z.object({ accountId: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const accounts = await ctx.db.account.findMany({
        where: { userId: ctx.auth.id, status: { not: "needs_reauth" }, ...(input?.accountId ? { id: input.accountId } : {}) },
        select: { id: true, emailAddress: true },
      });
      const results = await Promise.allSettled(accounts.map((a) => syncCalendarList(a.id, ctx.auth.id)));
      const failures = results
        .map((r, i) => (r.status === "rejected" ? `${accounts[i]!.emailAddress}: ${(r.reason as Error).message}` : null))
        .filter(Boolean) as string[];
      return { synced: accounts.length - failures.length, failures };
    }),

  setVisibility: protectedProcedure
    .input(z.object({ calendarId: z.string(), visible: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ownedCalendar(ctx.auth.id, input.calendarId);
      await ctx.db.calendar.update({ where: { id: input.calendarId }, data: { isVisible: input.visible } });
    }),

  setColor: protectedProcedure
    .input(z.object({ calendarId: z.string(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }))
    .mutation(async ({ ctx, input }) => {
      await ownedCalendar(ctx.auth.id, input.calendarId);
      await ctx.db.calendar.update({ where: { id: input.calendarId }, data: { color: input.color } });
    }),

  /** A calendar stored only in EverythingVA (useful for IMAP-only accounts). */
  createLocalCalendar: protectedProcedure
    .input(z.object({ accountId: z.string(), name: z.string().trim().min(1).max(100), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }))
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.db.account.findFirst({ where: { id: input.accountId, userId: ctx.auth.id }, select: { id: true } });
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      return ctx.db.calendar.create({ data: { accountId: account.id, name: input.name, color: input.color } });
    }),

  events: protectedProcedure
    .input(z.object({ timeMin: z.string().datetime(), timeMax: z.string().datetime() }))
    .query(async ({ ctx, input }) => {
      const min = new Date(input.timeMin);
      const max = new Date(input.timeMax);
      if (max.getTime() - min.getTime() > 1000 * 60 * 60 * 24 * 120) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Range too large (max 120 days)" });
      }
      return getEventsInRange(ctx.auth.id, min, max);
    }),

  /** Text search across visible calendars, 30 days back to 180 days ahead. */
  search: protectedProcedure
    .input(z.object({ query: z.string().trim().min(2).max(100) }))
    .query(async ({ ctx, input }) => {
      const now = Date.now();
      const { events } = await getEventsInRange(
        ctx.auth.id,
        new Date(now - 30 * 864e5),
        new Date(now + 90 * 864e5),
      );
      const q = input.query.toLowerCase();
      return events
        .filter((e) =>
          [e.title, e.location, e.description, ...e.attendees.map((a) => `${a.name ?? ""} ${a.email}`)]
            .filter(Boolean)
            .some((s) => s!.toLowerCase().includes(q)),
        )
        .slice(0, 50);
    }),

  createEvent: protectedProcedure
    .input(eventInput.extend({ calendarId: z.string(), notify: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const cal = await ownedCalendar(ctx.auth.id, input.calendarId);
      assertWritable(cal);
      const { calendarId: _c, notify, ...event } = input;
      if (new Date(event.end) < new Date(event.start)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The event ends before it starts." });
      }

      if (cal.aurinkoCalendarId) {
        try {
          const { calendar } = await getProviders(cal.accountId, ctx.auth.id);
          const created = await calendar.createEvent(cal.aurinkoCalendarId, event, notify);
          await ctx.db.calendar.update({ where: { id: cal.id }, data: { lastSyncAt: new Date() } });
          return { id: created.id };
        } catch (error) {
          throw asTRPCError(error, "Could not create the event");
        }
      }

      const start = new Date(event.start);
      const row = await ctx.db.calendarEvent.create({
        data: {
          calendarId: cal.id,
          title: event.title,
          description: event.description ?? null,
          location: event.location ?? null,
          startTime: start,
          endTime: new Date(event.end),
          isAllDay: event.allDay,
          timezone: event.timezone,
          attendees: event.attendees ?? [],
          ...localRecurrence(event.recurrence, start),
        },
      });
      return { id: row.id };
    }),

  updateEvent: protectedProcedure
    .input(
      z.object({
        calendarId: z.string(),
        eventId: z.string(),
        notify: z.boolean().default(true),
        patch: eventInput.partial().extend({ timezone: z.string().min(1).max(100) }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cal = await ownedCalendar(ctx.auth.id, input.calendarId);
      assertWritable(cal);
      const p = input.patch;
      if (p.start && p.end && new Date(p.end) < new Date(p.start)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The event ends before it starts." });
      }

      if (cal.aurinkoCalendarId) {
        try {
          const { calendar } = await getProviders(cal.accountId, ctx.auth.id);
          await calendar.updateEvent(cal.aurinkoCalendarId, input.eventId, p, input.notify);
          await ctx.db.calendar.update({ where: { id: cal.id }, data: { lastSyncAt: new Date() } });
          return { ok: true };
        } catch (error) {
          throw asTRPCError(error, "Could not update the event");
        }
      }

      const existing = await ctx.db.calendarEvent.findFirst({ where: { id: input.eventId, calendarId: cal.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      const start = p.start ? new Date(p.start) : existing.startTime;
      await ctx.db.calendarEvent.update({
        where: { id: existing.id },
        data: {
          ...(p.title !== undefined ? { title: p.title } : {}),
          ...(p.description !== undefined ? { description: p.description } : {}),
          ...(p.location !== undefined ? { location: p.location } : {}),
          ...(p.start ? { startTime: start } : {}),
          ...(p.end ? { endTime: new Date(p.end) } : {}),
          ...(p.allDay !== undefined ? { isAllDay: p.allDay } : {}),
          ...(p.attendees !== undefined ? { attendees: p.attendees } : {}),
          ...(p.recurrence !== undefined ? localRecurrence(p.recurrence, start) : {}),
          timezone: p.timezone,
        },
      });
      return { ok: true };
    }),

  deleteEvent: protectedProcedure
    .input(z.object({ calendarId: z.string(), eventId: z.string(), notify: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const cal = await ownedCalendar(ctx.auth.id, input.calendarId);
      assertWritable(cal);
      if (cal.aurinkoCalendarId) {
        try {
          const { calendar } = await getProviders(cal.accountId, ctx.auth.id);
          await calendar.deleteEvent(cal.aurinkoCalendarId, input.eventId, input.notify);
          await ctx.db.calendar.update({ where: { id: cal.id }, data: { lastSyncAt: new Date() } });
          return { ok: true };
        } catch (error) {
          throw asTRPCError(error, "Could not delete the event");
        }
      }
      const existing = await ctx.db.calendarEvent.findFirst({ where: { id: input.eventId, calendarId: cal.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      await ctx.db.$transaction([
        ctx.db.eventException.deleteMany({ where: { eventId: existing.id } }),
        ctx.db.calendarEvent.deleteMany({ where: { masterEventId: existing.id } }),
        ctx.db.calendarEvent.delete({ where: { id: existing.id } }),
      ]);
      return { ok: true };
    }),

  respond: protectedProcedure
    .input(
      z.object({
        calendarId: z.string(),
        eventId: z.string(),
        response: z.enum(["accepted", "tentative", "declined"]),
        comment: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cal = await ownedCalendar(ctx.auth.id, input.calendarId);
      if (!cal.aurinkoCalendarId) throw new TRPCError({ code: "BAD_REQUEST", message: "Local events have no invitations." });
      try {
        const { calendar } = await getProviders(cal.accountId, ctx.auth.id);
        await calendar.respond(cal.aurinkoCalendarId, input.eventId, input.response, input.comment);
        await ctx.db.calendar.update({ where: { id: cal.id }, data: { lastSyncAt: new Date() } });
        return { ok: true };
      } catch (error) {
        throw asTRPCError(error, "Could not send your response");
      }
    }),

  /** Busy blocks for attendees, used by the scheduling assistant. */
  freeBusy: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        emails: z.array(z.string().email()).min(1).max(20),
        timeMin: z.string().datetime(),
        timeMax: z.string().datetime(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const { calendar } = await getProviders(input.accountId, ctx.auth.id);
        return await calendar.freeBusy(input.emails, input.timeMin, input.timeMax);
      } catch (error) {
        throw asTRPCError(error, "Could not load availability");
      }
    }),
});
