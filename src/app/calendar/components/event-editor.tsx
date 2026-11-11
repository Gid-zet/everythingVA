"use client";

import React from "react";
import { addDays, addHours, addMinutes, differenceInMinutes, format, setHours, setMinutes, startOfDay } from "date-fns";
import { Loader2, MapPin, Repeat, Users, Video, X } from "lucide-react";
import { toast } from "sonner";

import { api, type RouterOutputs } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type RangeEvent = RouterOutputs["calendar"]["events"]["events"][number];

export interface EventPreset {
  title?: string;
  description?: string;
  start?: Date;
  allDay?: boolean;
  accountId?: string;
  calendarId?: string;
  attendees?: { email: string; name?: string | null }[];
}

type Freq = "none" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const timeZones = (): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
  } catch {
    return [localTz(), "UTC"];
  }
};

function parseRule(rule?: string | null) {
  const out = { freq: "none" as Freq, interval: 1, byDay: [] as string[], ends: "never" as "never" | "on" | "after", until: "", count: 10 };
  if (!rule) return out;
  for (const part of rule.replace(/^RRULE:/, "").split(";")) {
    const [k, v = ""] = part.split("=");
    if (k === "FREQ") out.freq = v as Freq;
    if (k === "INTERVAL") out.interval = Number(v) || 1;
    if (k === "BYDAY") out.byDay = v.split(",").map((d) => d.slice(-2));
    if (k === "UNTIL") {
      out.ends = "on";
      out.until = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
    }
    if (k === "COUNT") {
      out.ends = "after";
      out.count = Number(v) || 10;
    }
  }
  return out;
}

function buildRule(r: ReturnType<typeof parseRule>): string[] | null {
  if (r.freq === "none") return null;
  const parts = [`FREQ=${r.freq}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.freq === "WEEKLY" && r.byDay.length) parts.push(`BYDAY=${r.byDay.join(",")}`);
  if (r.ends === "on" && r.until) parts.push(`UNTIL=${r.until.replace(/-/g, "")}T235959Z`);
  if (r.ends === "after") parts.push(`COUNT=${Math.max(1, r.count)}`);
  return [`RRULE:${parts.join(";")}`];
}

const toDateInput = (d: Date) => format(d, "yyyy-MM-dd");
const toTimeInput = (d: Date) => format(d, "HH:mm");
const combine = (date: string, time: string) => {
  const [h, m] = time.split(":").map(Number);
  return setMinutes(setHours(new Date(`${date}T00:00:00`), h ?? 0), m ?? 0);
};

/**
 * Create or edit an event. Writes to the provider (Google / Microsoft via
 * Aurinko) for synced calendars, or the database for local calendars.
 */
export function EventEditorDialog({
  open,
  onOpenChange,
  event,
  preset,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: RangeEvent | null;
  preset?: EventPreset;
  onSaved?: () => void;
}) {
  const utils = api.useUtils();
  const { data: overview } = api.calendar.overview.useQuery(undefined, { enabled: open });
  const writable = React.useMemo(
    () =>
      (overview?.accounts ?? []).flatMap((a) =>
        a.status === "needs_reauth"
          ? []
          : a.calendars.filter((c) => !c.isReadOnly).map((c) => ({ ...c, accountId: a.id, accountEmail: a.emailAddress })),
      ),
    [overview],
  );

  const isEdit = !!event;
  const [title, setTitle] = React.useState("");
  const [calendarId, setCalendarId] = React.useState("");
  const [allDay, setAllDay] = React.useState(false);
  const [startDate, setStartDate] = React.useState("");
  const [startTime, setStartTime] = React.useState("09:00");
  const [endDate, setEndDate] = React.useState("");
  const [endTime, setEndTime] = React.useState("10:00");
  const [timezone, setTimezone] = React.useState(localTz());
  const [location, setLocation] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [online, setOnline] = React.useState(false);
  const [attendees, setAttendees] = React.useState<{ email: string; name?: string | null }[]>([]);
  const [attendeeDraft, setAttendeeDraft] = React.useState("");
  const [rule, setRule] = React.useState(parseRule(null));
  const [scope, setScope] = React.useState<"occurrence" | "series">("occurrence");
  const [notify, setNotify] = React.useState(true);

  // Initialise whenever the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    const now = new Date();
    const start = event
      ? new Date(event.allDay ? `${event.start.slice(0, 10)}T00:00:00` : event.start)
      : preset?.start ?? setMinutes(addHours(now, 1), 0); // next full hour
    const end = event
      ? new Date(event.allDay ? `${event.end.slice(0, 10)}T00:00:00` : event.end)
      : addHours(start, 1);
    setTitle(event?.title ?? preset?.title ?? "");
    setAllDay(event?.allDay ?? preset?.allDay ?? false);
    setStartDate(toDateInput(start));
    setStartTime(toTimeInput(start));
    // All-day ends are exclusive at the provider; show the inclusive last day.
    setEndDate(toDateInput(event?.allDay ? addDays(end, -1) : end));
    setEndTime(toTimeInput(end));
    setTimezone(localTz());
    setLocation(event?.location ?? "");
    setDescription(event?.description ?? preset?.description ?? "");
    setOnline(!!event?.meetingUrl);
    setAttendees(event?.attendees.map((a) => ({ email: a.email, name: a.name })) ?? preset?.attendees ?? []);
    setRule(parseRule(event?.recurrence?.find((r) => r.startsWith("RRULE:"))));
    setScope("occurrence");
    setNotify(true);
  }, [open, event, preset]);

  // Default calendar: event's, preset's, primary of the preset account, or first writable.
  React.useEffect(() => {
    if (!open || !writable.length) return;
    if (event) return setCalendarId(event.calendarId);
    const pick =
      writable.find((c) => c.id === preset?.calendarId) ??
      writable.find((c) => c.accountId === preset?.accountId && c.isPrimary) ??
      writable.find((c) => c.accountId === preset?.accountId) ??
      writable.find((c) => c.isPrimary) ??
      writable[0];
    setCalendarId(pick?.id ?? "");
  }, [open, writable, event, preset]);

  const selectedCal = writable.find((c) => c.id === calendarId);
  const start = allDay ? new Date(`${startDate}T00:00:00`) : combine(startDate, startTime);
  const end = allDay ? addDays(new Date(`${endDate}T00:00:00`), 1) : combine(endDate, endTime);
  const valid =
    title.trim().length > 0 && !!calendarId && !!startDate && !!endDate &&
    !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start;

  // Scheduling assistant: attendees' busy blocks on the start day.
  const dayStart = startOfDay(start);
  const dayValid = !Number.isNaN(dayStart.getTime());
  const freeBusy = api.calendar.freeBusy.useQuery(
    {
      accountId: selectedCal?.accountId ?? "",
      emails: attendees.map((a) => a.email).slice(0, 20),
      timeMin: dayValid ? dayStart.toISOString() : "",
      timeMax: dayValid ? addDays(dayStart, 1).toISOString() : "",
    },
    {
      enabled: open && dayValid && !!selectedCal && !selectedCal.local && attendees.length > 0 && !allDay,
      retry: false,
      staleTime: 60_000,
    },
  );
  const conflicts = (freeBusy.data ?? []).filter((fb) =>
    fb.busy.some((b) => new Date(b.start) < end && new Date(b.end) > start),
  );

  const invalidate = () => {
    void utils.calendar.events.invalidate();
    void utils.calendar.overview.invalidate();
  };
  const create = api.calendar.createEvent.useMutation();
  const update = api.calendar.updateEvent.useMutation();
  const saving = create.isPending || update.isPending;

  const addAttendee = () => {
    const emails = attendeeDraft.split(/[,;\s]+/).map((e) => e.trim()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (!emails.length) return;
    setAttendees((list) => [...list, ...emails.filter((e) => !list.some((a) => a.email === e)).map((email) => ({ email }))]);
    setAttendeeDraft("");
  };

  const submit = async () => {
    if (!valid) return;
    const payload = {
      title: title.trim(),
      description: description || null,
      location: location || null,
      start: allDay ? toDateInput(start) : start.toISOString(),
      end: allDay ? toDateInput(end) : end.toISOString(),
      allDay,
      timezone,
      attendees: attendees.map((a) => ({ email: a.email, name: a.name ?? undefined })),
      recurrence: buildRule(rule),
      onlineMeeting: online && !event?.meetingUrl ? true : undefined,
    };
    try {
      if (event) {
        const targetId = scope === "series" && event.masterId ? event.masterId : event.id;
        const { recurrence, ...rest } = payload;
        await update.mutateAsync({
          calendarId: event.calendarId,
          eventId: targetId,
          notify,
          patch: scope === "series" || !event.recurring ? payload : rest,
        });
        toast.success("Event updated");
      } else {
        await create.mutateAsync({ ...payload, calendarId, notify });
        toast.success(`Added to ${selectedCal?.name ?? "calendar"}`);
      }
      invalidate();
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the event");
    }
  };

  const zones = React.useMemo(() => Array.from(new Set([localTz(), timezone, ...timeZones()])), [timezone]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription className="sr-only">Event details</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add title"
            aria-label="Title"
            className="h-11 border-0 border-b px-0 text-lg font-medium shadow-none focus-visible:ring-0"
          />

          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Calendar</Label>
            <Select value={calendarId} onValueChange={setCalendarId} disabled={isEdit}>
              <SelectTrigger aria-label="Calendar">
                <SelectValue placeholder={writable.length ? "Choose a calendar" : "No writable calendars"} />
              </SelectTrigger>
              <SelectContent>
                {writable.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: c.color ?? "#6366f1" }} />
                      {c.name}
                      <span className="text-xs text-muted-foreground">{c.accountEmail}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">When</Label>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={allDay} onCheckedChange={setAllDay} aria-label="All day" />
                All day
              </label>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} aria-label="Start date" />
              {!allDay && (
                <Input
                  type="time"
                  value={startTime}
                  aria-label="Start time"
                  onChange={(e) => {
                    const mins = differenceInMinutes(combine(endDate, endTime), combine(startDate, startTime));
                    setStartTime(e.target.value);
                    const next = addMinutes(combine(startDate, e.target.value), mins > 0 ? mins : 60);
                    setEndDate(toDateInput(next));
                    setEndTime(toTimeInput(next));
                  }}
                />
              )}
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="End date" />
              {!allDay && <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="End time" />}
            </div>
            {!valid && title && end <= start && <p className="text-xs text-destructive">The event must end after it starts.</p>}
            {!allDay && (
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="h-8 text-xs" aria-label="Time zone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {zones.map((z) => (
                    <SelectItem key={z} value={z} className="text-xs">
                      {z.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Repeat */}
          {(!isEdit || scope === "series" || !event?.recurring) && (
            <div className="grid gap-2">
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Repeat className="size-3.5" /> Repeat
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={rule.freq} onValueChange={(v) => setRule((r) => ({ ...r, freq: v as Freq }))}>
                  <SelectTrigger className="h-9 w-[150px]" aria-label="Repeat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Does not repeat</SelectItem>
                    <SelectItem value="DAILY">Daily</SelectItem>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="YEARLY">Yearly</SelectItem>
                  </SelectContent>
                </Select>
                {rule.freq !== "none" && (
                  <>
                    <span className="text-xs text-muted-foreground">every</span>
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      value={rule.interval}
                      onChange={(e) => setRule((r) => ({ ...r, interval: Math.max(1, Number(e.target.value) || 1) }))}
                      className="h-9 w-16"
                      aria-label="Interval"
                    />
                    <Select value={rule.ends} onValueChange={(v) => setRule((r) => ({ ...r, ends: v as typeof r.ends }))}>
                      <SelectTrigger className="h-9 w-[120px]" aria-label="Ends">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="never">Never ends</SelectItem>
                        <SelectItem value="on">Ends on</SelectItem>
                        <SelectItem value="after">Ends after</SelectItem>
                      </SelectContent>
                    </Select>
                    {rule.ends === "on" && (
                      <Input type="date" value={rule.until} onChange={(e) => setRule((r) => ({ ...r, until: e.target.value }))} className="h-9 w-[150px]" aria-label="End repeat on" />
                    )}
                    {rule.ends === "after" && (
                      <span className="flex items-center gap-1 text-xs">
                        <Input type="number" min={1} max={500} value={rule.count} onChange={(e) => setRule((r) => ({ ...r, count: Number(e.target.value) || 1 }))} className="h-9 w-16" aria-label="Occurrences" />
                        times
                      </span>
                    )}
                  </>
                )}
              </div>
              {rule.freq === "WEEKLY" && (
                <div className="flex gap-1" role="group" aria-label="Repeat on">
                  {DAYS.map((d) => {
                    const on = rule.byDay.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setRule((r) => ({ ...r, byDay: on ? r.byDay.filter((x) => x !== d) : [...r.byDay, d] }))}
                        className={cn(
                          "size-8 rounded-full text-[11px] font-medium transition-colors",
                          on ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {d[0]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {isEdit && event?.recurring && event.source === "provider" && (
            <div className="flex gap-2 rounded-lg bg-muted/60 p-1 text-xs" role="radiogroup" aria-label="Apply changes to">
              {(["occurrence", "series"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={scope === s}
                  onClick={() => setScope(s)}
                  className={cn("flex-1 rounded-md py-1.5", scope === s ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
                >
                  {s === "occurrence" ? "This event" : "All events in the series"}
                </button>
              ))}
            </div>
          )}

          {/* Attendees */}
          {!selectedCal?.local && (
            <div className="grid gap-2">
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5" /> Guests
              </Label>
              <div className="flex gap-2">
                <Input
                  value={attendeeDraft}
                  onChange={(e) => setAttendeeDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addAttendee();
                    }
                  }}
                  onBlur={addAttendee}
                  placeholder="Add guests by email"
                  aria-label="Add guest"
                />
              </div>
              {attendees.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {attendees.map((a) => {
                    const busy = conflicts.some((c) => c.email.toLowerCase() === a.email.toLowerCase());
                    return (
                      <li key={a.email} className={cn("inline-flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-xs", busy && "border-amber-500/50 bg-amber-500/10")}>
                        {a.name || a.email}
                        {busy && <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">busy</span>}
                        <button type="button" onClick={() => setAttendees((l) => l.filter((x) => x.email !== a.email))} className="rounded-full p-0.5 hover:bg-muted" aria-label={`Remove ${a.email}`}>
                          <X className="size-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {freeBusy.isFetching && <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Checking availability…</p>}
              {conflicts.length > 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  {conflicts.length === 1 ? "1 guest is" : `${conflicts.length} guests are`} busy at this time.
                </p>
              )}
              {attendees.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={notify} onCheckedChange={setNotify} aria-label="Send invitations" />
                  Email {isEdit ? "updates" : "invitations"} to guests
                </label>
              )}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="relative">
              <MapPin className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" className="pl-8" aria-label="Location" />
            </div>
            {!selectedCal?.local && (
              <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
                <Video className="size-4 text-muted-foreground" />
                <span className="flex-1">{event?.meetingUrl ? "Has video meeting" : "Add video meeting"}</span>
                <Switch checked={online} onCheckedChange={setOnline} disabled={!!event?.meetingUrl} aria-label="Video meeting" />
              </label>
            )}
          </div>

          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes" rows={3} aria-label="Notes" />

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving} isLoading={saving}>
              {isEdit ? "Save" : "Create event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
