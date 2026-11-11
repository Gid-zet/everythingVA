/**
 * Provider-agnostic integration contracts.
 *
 * The app talks to mailboxes and calendars only through these interfaces.
 * Today one adapter (Aurinko) implements them and covers Google Workspace /
 * Gmail, Microsoft 365 / Outlook.com, Exchange (EWS), iCloud and generic IMAP.
 * A direct Gmail or Graph adapter can be added later by implementing the same
 * interfaces and registering it in ./index.ts. Nothing above this layer knows
 * which provider an account uses, except through `capabilities`.
 */

export type ServiceType = "Google" | "Office365" | "EWS" | "IMAP" | "iCloud";

export const SERVICE_LABELS: Record<ServiceType, string> = {
  Google: "Google",
  Office365: "Microsoft 365 / Outlook",
  EWS: "Exchange",
  IMAP: "IMAP",
  iCloud: "iCloud",
};

export interface MailCapabilities {
  archive: boolean;
  trash: boolean;
  star: boolean;
  spam: boolean;
  readState: boolean;
  drafts: boolean;
}

export interface Address {
  name?: string | null;
  address: string;
}

export interface OutgoingMessage {
  from: Address;
  to: Address[];
  cc?: Address[];
  bcc?: Address[];
  replyTo?: Address[];
  subject: string;
  /** HTML body */
  body: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
  attachments?: { name: string; mimeType: string; content: string /* base64 */ }[];
}

export interface Attachment {
  name: string;
  mimeType: string;
  size?: number;
  /** base64 */
  content: string;
}

/** Result of a batch action: provider actions are best-effort per message. */
export interface BatchResult {
  ok: number;
  failed: number;
  unsupported?: boolean;
  firstError?: string;
}

export interface MailProvider {
  readonly serviceType: ServiceType | null;
  readonly capabilities: MailCapabilities;
  setRead(messageIds: string[], read: boolean): Promise<BatchResult>;
  setArchived(messageIds: string[], archived: boolean): Promise<BatchResult>;
  setStarred(messageIds: string[], starred: boolean): Promise<BatchResult>;
  setTrashed(messageIds: string[], trashed: boolean): Promise<BatchResult>;
  setSpam(messageIds: string[], spam: boolean): Promise<BatchResult>;
  /** Replace user labels (Gmail labels / Outlook categories / IMAP keywords). */
  setLabels(messageIds: string[], labels: string[]): Promise<BatchResult>;
  send(message: OutgoingMessage): Promise<{ id?: string }>;
  getAttachment(messageId: string, attachmentId: string): Promise<Attachment>;
  subscribe(notificationUrl: string): Promise<void>;
}

// ---------- Calendar ----------

export type RsvpResponse = "accepted" | "tentative" | "declined";
export type AttendeeResponse = RsvpResponse | "noResponse";

export interface ProviderCalendar {
  id: string;
  name: string;
  color?: string | null;
  description?: string | null;
  primary: boolean;
  accessRole: "owner" | "writer" | "reader" | null;
}

export interface EventAttendee {
  email: string;
  name?: string | null;
  type?: "required" | "optional" | "resource";
  response?: AttendeeResponse;
}

export interface ProviderEvent {
  id: string;
  calendarId: string;
  etag?: string;
  title: string;
  description?: string | null;
  location?: string | null;
  /** ISO instant for timed events; `YYYY-MM-DD` start date for all-day */
  start: string;
  end: string;
  allDay: boolean;
  timezone?: string | null;
  organizer?: Address | null;
  attendees: EventAttendee[];
  /** The signed-in user's own RSVP, when they are an attendee */
  myResponse?: AttendeeResponse | null;
  meetingUrl?: string | null;
  recurrenceType: "single" | "master" | "occurrence";
  /** RRULE strings for masters */
  recurrence?: string[];
  masterId?: string | null;
  showAs?: string | null;
  htmlLink?: string | null;
  canceled?: boolean;
}

export interface EventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  start: string;
  end: string;
  allDay: boolean;
  timezone: string;
  attendees?: { email: string; name?: string | null; type?: "required" | "optional" }[];
  /** RRULE lines, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE"] */
  recurrence?: string[] | null;
  onlineMeeting?: boolean;
  showAs?: "free" | "busy" | "tentative" | "outOfOffice";
}

export interface FreeBusy {
  email: string;
  busy: { start: string; end: string }[];
  error?: string;
}

export interface CalendarProvider {
  listCalendars(): Promise<ProviderCalendar[]>;
  listEvents(calendarId: string, timeMin: string, timeMax: string): Promise<ProviderEvent[]>;
  getEvent(calendarId: string, eventId: string): Promise<ProviderEvent>;
  createEvent(calendarId: string, input: EventInput, notify: boolean): Promise<ProviderEvent>;
  updateEvent(
    calendarId: string,
    eventId: string,
    patch: Partial<EventInput>,
    notify: boolean,
  ): Promise<ProviderEvent | { id: string }>;
  deleteEvent(calendarId: string, eventId: string, notify: boolean): Promise<void>;
  respond(calendarId: string, eventId: string, response: RsvpResponse, comment?: string): Promise<void>;
  freeBusy(emails: string[], timeMin: string, timeMax: string): Promise<FreeBusy[]>;
  subscribe(calendarId: string, notificationUrl: string): Promise<void>;
}

/** Thrown when the provider says the stored credentials no longer work. */
export class ReauthRequiredError extends Error {
  constructor(message = "This account needs to be reconnected.") {
    super(message);
    this.name = "ReauthRequiredError";
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
