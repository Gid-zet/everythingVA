import "server-only";
import type { AurinkoClient } from "./http";
import type {
  AttendeeResponse,
  CalendarProvider,
  EventInput,
  FreeBusy,
  ProviderCalendar,
  ProviderEvent,
} from "../types";

/**
 * Aurinko calendar adapter (paths and fields from Aurinko's OpenAPI spec).
 *
 *   GET    /calendars                                   list calendars (paged)
 *   GET    /calendars/{id}/events/range?timeMin&timeMax  events, recurrences expanded
 *   GET    /calendars/{id}/events/{eventId}
 *   POST   /calendars/{id}/events?notifyAttendees        create
 *   PATCH  /calendars/{id}/events/{eventId}?notifyAttendees  update
 *   DELETE /calendars/{id}/events/{eventId}?notifyAttendees
 *   PUT    /calendars/{id}/events/{eventId}/response      RSVP
 *   POST   /calendars/freeBusy                            availability
 *   POST   /subscriptions { resource: /calendars/{id}/events }
 *
 * The range endpoint returns individual occurrences of recurring series with
 * time zones already resolved by the provider, which is what makes DST and
 * series exceptions correct without re-implementing RFC 5545 expansion here.
 */

type AurinkoDateTime = { dateOnly?: string; dateTime?: string; timezone?: string };
type AurinkoEvent = {
  id: string;
  etag?: string;
  calendarId?: string;
  subject?: string;
  description?: string;
  location?: string;
  start?: AurinkoDateTime;
  end?: AurinkoDateTime;
  organizer?: { emailAddress?: { name?: string; address?: string } };
  meetingInfo?: {
    canceled?: boolean;
    response?: AttendeeResponse;
    attendees?: {
      emailAddress?: { name?: string; address?: string };
      type?: "required" | "optional" | "resource";
      response?: string;
    }[];
    onlineMeeting?: boolean;
    onlineMeetingDetails?: { url?: string };
  };
  recurrenceType?: "single" | "master" | "occurrence";
  recurrence?: { ical?: { rules?: string[] } };
  occurrenceInfo?: { masterId?: string };
  showAs?: string;
  htmlLink?: string;
};

const MEETING_URL = /https:\/\/(?:[\w-]+\.)?(?:zoom\.us\/j|meet\.google\.com|teams\.microsoft\.com\/l\/meetup-join|teams\.live\.com\/meet|[\w-]+\.webex\.com)[^\s"<>)]*/i;

function normalizeResponse(r?: string): AttendeeResponse | undefined {
  if (!r) return undefined;
  if (r === "tentitive") return "tentative"; // spelling in Aurinko's attendee enum
  return (["accepted", "tentative", "declined", "noResponse"] as const).includes(r as AttendeeResponse)
    ? (r as AttendeeResponse)
    : undefined;
}

function toTime(t?: AurinkoDateTime) {
  if (t?.dateOnly) return { value: t.dateOnly, allDay: true };
  return { value: t?.dateTime ?? "", allDay: false };
}

export function mapEvent(e: AurinkoEvent, calendarId: string): ProviderEvent {
  const start = toTime(e.start);
  const end = toTime(e.end);
  const meetingUrl =
    e.meetingInfo?.onlineMeetingDetails?.url ??
    e.location?.match(MEETING_URL)?.[0] ??
    e.description?.match(MEETING_URL)?.[0] ??
    null;
  return {
    id: e.id,
    calendarId: e.calendarId ?? calendarId,
    etag: e.etag,
    title: e.subject?.trim() || "(No title)",
    description: e.description ?? null,
    location: e.location ?? null,
    start: start.value,
    end: end.value,
    allDay: start.allDay,
    timezone: e.start?.timezone ?? null,
    organizer: e.organizer?.emailAddress?.address
      ? { name: e.organizer.emailAddress.name, address: e.organizer.emailAddress.address }
      : null,
    attendees: (e.meetingInfo?.attendees ?? [])
      .filter((a) => a.emailAddress?.address)
      .map((a) => ({
        email: a.emailAddress!.address!,
        name: a.emailAddress?.name ?? null,
        type: a.type,
        response: normalizeResponse(a.response),
      })),
    myResponse: normalizeResponse(e.meetingInfo?.response) ?? null,
    meetingUrl,
    recurrenceType: e.recurrenceType ?? "single",
    recurrence: e.recurrence?.ical?.rules,
    masterId: e.occurrenceInfo?.masterId ?? null,
    showAs: e.showAs ?? null,
    htmlLink: e.htmlLink ?? null,
    canceled: e.meetingInfo?.canceled ?? false,
  };
}

function toAurinko(input: Partial<EventInput>) {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body.subject = input.title;
  if (input.description !== undefined) body.description = input.description ?? "";
  if (input.location !== undefined) body.location = input.location ?? "";
  if (input.start !== undefined) {
    body.start = input.allDay
      ? { dateOnly: input.start.slice(0, 10) }
      : { dateTime: input.start, timezone: input.timezone };
  }
  if (input.end !== undefined) {
    body.end = input.allDay ? { dateOnly: input.end.slice(0, 10) } : { dateTime: input.end, timezone: input.timezone };
  }
  if (input.attendees !== undefined || input.onlineMeeting !== undefined) {
    body.meetingInfo = {
      ...(input.attendees !== undefined
        ? {
            attendees: input.attendees.map((a) => ({
              emailAddress: { address: a.email, name: a.name ?? undefined },
              type: a.type ?? "required",
            })),
          }
        : {}),
      ...(input.onlineMeeting ? { onlineMeeting: true } : {}),
    };
  }
  if (input.recurrence !== undefined) {
    body.recurrence = input.recurrence?.length ? { ical: { rules: input.recurrence } } : null;
  }
  if (input.showAs) body.showAs = input.showAs;
  return body;
}

export function aurinkoCalendar(client: AurinkoClient): CalendarProvider {
  const enc = encodeURIComponent;

  return {
    async listCalendars() {
      const out: ProviderCalendar[] = [];
      let pageToken: string | undefined;
      do {
        const page = await client.get<{
          records?: { id: string; name: string; color?: string; description?: string; primary?: boolean; accessRole?: ProviderCalendar["accessRole"] }[];
          nextPageToken?: string;
        }>("/calendars", pageToken ? { pageToken } : undefined);
        for (const c of page.records ?? []) {
          out.push({
            id: c.id,
            name: c.name,
            color: c.color ?? null,
            description: c.description ?? null,
            primary: !!c.primary,
            accessRole: c.accessRole ?? null,
          });
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
      return out;
    },

    async listEvents(calendarId, timeMin, timeMax) {
      const out: ProviderEvent[] = [];
      let pageToken: string | undefined;
      let guard = 0;
      do {
        const page = await client.get<{ records?: AurinkoEvent[]; nextPageToken?: string }>(
          `/calendars/${enc(calendarId)}/events/range`,
          { timeMin, timeMax, ...(pageToken ? { pageToken } : {}) },
        );
        for (const e of page.records ?? []) out.push(mapEvent(e, calendarId));
        pageToken = page.nextPageToken;
      } while (pageToken && ++guard < 20);
      return out;
    },

    async getEvent(calendarId, eventId) {
      return mapEvent(
        await client.get<AurinkoEvent>(`/calendars/${enc(calendarId)}/events/${enc(eventId)}`),
        calendarId,
      );
    },

    async createEvent(calendarId, input, notify) {
      const e = await client.post<AurinkoEvent>(`/calendars/${enc(calendarId)}/events`, toAurinko(input), {
        notifyAttendees: notify,
        bodyType: "text",
        returnRecord: true,
      });
      return mapEvent(e, calendarId);
    },

    async updateEvent(calendarId, eventId, patch, notify) {
      const e = await client.patch<AurinkoEvent | { id: string }>(
        `/calendars/${enc(calendarId)}/events/${enc(eventId)}`,
        toAurinko(patch),
        { notifyAttendees: notify, returnRecord: true },
      );
      return "subject" in e || "start" in e ? mapEvent(e as AurinkoEvent, calendarId) : { id: e.id };
    },

    async deleteEvent(calendarId, eventId, notify) {
      await client.delete(`/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { notifyAttendees: notify });
    },

    async respond(calendarId, eventId, response, comment) {
      await client.put(
        `/calendars/${enc(calendarId)}/events/${enc(eventId)}/response`,
        { response, comment },
        { notifyAttendees: true },
      );
    },

    async freeBusy(emails, timeMin, timeMax): Promise<FreeBusy[]> {
      const res = await client.post<{
        records?: {
          email?: string;
          error?: string;
          items?: { start: string; end: string; status?: string }[];
        }[];
      }>("/calendars/freeBusy", { timeMin, timeMax, emails });
      return (res.records ?? []).map((r) => ({
        email: r.email ?? "",
        busy: (r.items ?? [])
          .filter((i) => i.status !== "free")
          .map((i) => ({ start: i.start, end: i.end })),
        error: r.error,
      }));
    },

    async subscribe(calendarId, notificationUrl) {
      await client.post("/subscriptions", { resource: `/calendars/${calendarId}/events`, notificationUrl });
    },
  };
}
