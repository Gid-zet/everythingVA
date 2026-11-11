import "server-only";
import { db } from "@/server/db";
import { getProviders, type ProviderEvent } from "@/server/providers";
import { applyExceptions, generateOccurrences, parseRRULE, type RecurrenceRule } from "@/lib/recurrence";

/** Local series: RRULE text (current) or the legacy JSON rule object. */
function ruleOf(rec: unknown, start: Date): RecurrenceRule | null {
  if (typeof rec === "string") return parseRRULE(rec.replace(/^RRULE:/, ""), start);
  if (rec && typeof rec === "object" && "frequency" in rec) {
    const r = rec as RecurrenceRule & { endDate?: string | Date };
    return { ...r, endDate: r.endDate ? new Date(r.endDate) : undefined };
  }
  return null;
}

/**
 * Calendar data flow
 * ------------------
 * - Calendar *lists* are mirrored into the DB (names, colours, access role,
 *   per-user visibility) by `syncCalendarList`, on connect and on demand.
 * - Provider *events* are read live per visible range from
 *   `/calendars/{id}/events/range`. The provider expands recurring series and
 *   applies exceptions and time zones, so there is one source of truth: no
 *   duplicate copies to reconcile and no drift after edits made in Google or
 *   Outlook. Aurinko webhooks bump `Calendar.lastSyncAt`, and clients poll
 *   that "version" to refetch promptly.
 * - Events on local calendars (accounts without a provider calendar) live in
 *   the DB and use the existing RRULE engine in src/lib/recurrence.ts.
 */

const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

function webhookBase() {
  return process.env.AURINKO_WEBHOOK_BASE_URL ?? process.env.NEXT_PUBLIC_URL ?? null;
}

export async function syncCalendarList(accountId: string, userId: string | null = null) {
  const { calendar } = await getProviders(accountId, userId);
  const remote = await calendar.listCalendars();
  const existing = await db.calendar.findMany({
    where: { accountId },
    select: { id: true, aurinkoCalendarId: true, color: true },
  });
  const byRemoteId = new Map(existing.filter((c) => c.aurinkoCalendarId).map((c) => [c.aurinkoCalendarId!, c]));

  const created: string[] = [];
  for (const [i, cal] of remote.entries()) {
    const color = cal.color || byRemoteId.get(cal.id)?.color || PALETTE[i % PALETTE.length]!;
    const data = {
      name: cal.name,
      description: cal.description,
      color,
      isPrimary: cal.primary,
      isReadOnly: cal.accessRole === "reader",
      accessRole: cal.accessRole,
      lastSyncAt: new Date(),
    };
    const row = byRemoteId.get(cal.id);
    if (row) {
      await db.calendar.update({ where: { id: row.id }, data });
    } else {
      await db.calendar.create({ data: { ...data, accountId, aurinkoCalendarId: cal.id } });
      created.push(cal.id);
    }
  }

  const remoteIds = new Set(remote.map((c) => c.id));
  const gone = existing.filter((c) => c.aurinkoCalendarId && !remoteIds.has(c.aurinkoCalendarId)).map((c) => c.id);
  if (gone.length) {
    // Provider calendars hold no local events, so removing the rows is safe.
    await db.calendarEvent.deleteMany({ where: { calendarId: { in: gone } } });
    await db.calendar.deleteMany({ where: { id: { in: gone } } });
  }

  // Webhooks for new calendars (best effort; polling covers failures).
  const base = webhookBase();
  if (base && created.length) {
    await Promise.allSettled(created.map((id) => calendar.subscribe(id, `${base}/api/aurinko/webhook`)));
  }
  return { calendars: remote.length, added: created.length, removed: gone.length };
}

export interface RangeEvent {
  /** Unique across accounts: `${calendarRowId}:${providerEventId}` */
  key: string;
  id: string;
  calendarId: string; // Calendar row id
  providerCalendarId: string | null;
  accountId: string;
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  color: string;
  attendees: ProviderEvent["attendees"];
  organizer: ProviderEvent["organizer"] | null;
  myResponse: ProviderEvent["myResponse"] | null;
  meetingUrl: string | null;
  recurring: boolean;
  masterId: string | null;
  recurrence: string[] | null;
  readOnly: boolean;
  htmlLink: string | null;
  source: "provider" | "local";
}

/** Load events for every visible calendar the user owns, across accounts. */
export async function getEventsInRange(
  userId: string,
  timeMin: Date,
  timeMax: Date,
  calendarIds?: string[],
) {
  const calendars = await db.calendar.findMany({
    where: {
      account: { userId },
      ...(calendarIds?.length ? { id: { in: calendarIds } } : { isVisible: true }),
    },
    select: {
      id: true,
      accountId: true,
      aurinkoCalendarId: true,
      color: true,
      isReadOnly: true,
      account: { select: { status: true, emailAddress: true } },
    },
  });

  const errors: { calendarId: string; message: string }[] = [];
  const events: RangeEvent[] = [];

  const byAccount = new Map<string, typeof calendars>();
  for (const c of calendars) byAccount.set(c.accountId, [...(byAccount.get(c.accountId) ?? []), c]);

  await Promise.all(
    [...byAccount.entries()].map(async ([accountId, cals]) => {
      const providerCals = cals.filter((c) => c.aurinkoCalendarId);
      const localCals = cals.filter((c) => !c.aurinkoCalendarId);

      if (providerCals.length && cals[0]!.account.status !== "needs_reauth") {
        try {
          const { calendar } = await getProviders(accountId, userId);
          await Promise.all(
            providerCals.map(async (cal) => {
              try {
                const list = await calendar.listEvents(cal.aurinkoCalendarId!, timeMin.toISOString(), timeMax.toISOString());
                for (const e of list) {
                  if (e.canceled) continue;
                  events.push({
                    key: `${cal.id}:${e.id}`,
                    id: e.id,
                    calendarId: cal.id,
                    providerCalendarId: cal.aurinkoCalendarId,
                    accountId,
                    title: e.title,
                    description: e.description ?? null,
                    location: e.location ?? null,
                    start: e.start,
                    end: e.end,
                    allDay: e.allDay,
                    color: cal.color ?? PALETTE[0]!,
                    attendees: e.attendees,
                    organizer: e.organizer ?? null,
                    myResponse: e.myResponse ?? null,
                    meetingUrl: e.meetingUrl ?? null,
                    recurring: e.recurrenceType !== "single",
                    masterId: e.masterId ?? null,
                    recurrence: e.recurrence ?? null,
                    readOnly: cal.isReadOnly,
                    htmlLink: e.htmlLink ?? null,
                    source: "provider",
                  });
                }
              } catch (error) {
                errors.push({ calendarId: cal.id, message: (error as Error).message });
              }
            }),
          );
        } catch (error) {
          for (const cal of providerCals) errors.push({ calendarId: cal.id, message: (error as Error).message });
        }
      } else if (providerCals.length) {
        for (const cal of providerCals) {
          errors.push({ calendarId: cal.id, message: `${cal.account.emailAddress} needs to be reconnected.` });
        }
      }

      if (localCals.length) {
        const rows = await db.calendarEvent.findMany({
          include: { exceptions: true },
          where: {
            calendarId: { in: localCals.map((c) => c.id) },
            masterEventId: null,
            OR: [
              { isRecurring: true },
              { AND: [{ startTime: { lt: timeMax } }, { endTime: { gt: timeMin } }] },
            ],
          },
        });
        const colorOf = new Map(localCals.map((c) => [c.id, c.color ?? PALETTE[0]!]));
        for (const r of rows) {
          const base = {
            calendarId: r.calendarId,
            providerCalendarId: null,
            accountId,
            description: r.description,
            location: r.location,
            color: colorOf.get(r.calendarId)!,
            attendees: (Array.isArray(r.attendees) ? r.attendees : []) as unknown as RangeEvent["attendees"],
            organizer: null,
            myResponse: null,
            meetingUrl: r.meetingUrl,
            readOnly: false,
            htmlLink: null,
            source: "local" as const,
          };
          const rule = r.isRecurring ? ruleOf(r.recurrence, r.startTime) : null;
          if (rule) {
            if (r.recurrenceEndDate) rule.endDate = r.recurrenceEndDate;
            if (r.recurrenceCount) rule.count = r.recurrenceCount;
            const occ = applyExceptions(
              generateOccurrences(r.startTime, r.endTime, rule, timeMin, timeMax, r.timezone ?? undefined),
              r.exceptions.map((x) => ({
                occurrenceDate: x.occurrenceDate,
                type: x.type,
                startTime: x.startTime ?? undefined,
                endTime: x.endTime ?? undefined,
                title: x.title ?? undefined,
                isDeleted: x.isDeleted,
              })),
            );
            for (const o of occ) {
              events.push({
                ...base,
                key: `${r.calendarId}:${r.id}:${o.startTime.getTime()}`,
                id: r.id,
                title: (o as { title?: string }).title ?? r.title,
                start: o.startTime.toISOString(),
                end: o.endTime.toISOString(),
                allDay: r.isAllDay,
                recurring: true,
                masterId: r.id,
                recurrence: null,
              });
            }
          } else {
            events.push({
              ...base,
              key: `${r.calendarId}:${r.id}`,
              id: r.id,
              title: r.title,
              start: r.startTime.toISOString(),
              end: r.endTime.toISOString(),
              allDay: r.isAllDay,
              recurring: false,
              masterId: null,
              recurrence: null,
            });
          }
        }
      }
    }),
  );

  events.sort((a, b) => a.start.localeCompare(b.start));
  return { events, errors };
}
