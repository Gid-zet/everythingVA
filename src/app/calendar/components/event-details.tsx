"use client";

import React from "react";
import { addDays, format, isSameDay } from "date-fns";
import { CalendarDays, Check, ExternalLink, HelpCircle, MapPin, Pencil, Repeat, Trash2, Users, Video, X } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RangeEvent } from "./event-editor";

function when(e: RangeEvent) {
  if (e.allDay) {
    const start = new Date(`${e.start.slice(0, 10)}T00:00:00`);
    const last = addDays(new Date(`${e.end.slice(0, 10)}T00:00:00`), -1);
    return isSameDay(start, last) || last < start
      ? `${format(start, "EEEE, MMMM d")} · All day`
      : `${format(start, "MMM d")} – ${format(last, "MMM d")} · All day`;
  }
  const s = new Date(e.start);
  const end = new Date(e.end);
  return isSameDay(s, end)
    ? `${format(s, "EEEE, MMMM d")} · ${format(s, "h:mm a")} – ${format(end, "h:mm a")}`
    : `${format(s, "MMM d, h:mm a")} – ${format(end, "MMM d, h:mm a")}`;
}

const RESPONSE_LABEL = { accepted: "Going", tentative: "Maybe", declined: "Declined", noResponse: "Awaiting" } as const;

/** Read view of an event with RSVP, join link, edit and delete. */
export function EventDetails({
  event,
  calendarName,
  onClose,
  onEdit,
}: {
  event: RangeEvent;
  calendarName?: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const utils = api.useUtils();
  const respond = api.calendar.respond.useMutation();
  const del = api.calendar.deleteEvent.useMutation();
  const [myResponse, setMyResponse] = React.useState(event.myResponse);
  React.useEffect(() => setMyResponse(event.myResponse), [event]);

  const isInvite = event.source === "provider" && event.attendees.length > 0 && !!event.organizer && !!event.myResponse;

  const rsvp = async (response: "accepted" | "tentative" | "declined") => {
    const prev = myResponse;
    setMyResponse(response);
    try {
      await respond.mutateAsync({ calendarId: event.calendarId, eventId: event.id, response });
      toast.success(response === "accepted" ? "You're going" : response === "tentative" ? "Marked as maybe" : "Declined");
      void utils.calendar.events.invalidate();
    } catch (error) {
      setMyResponse(prev);
      toast.error(error instanceof Error ? error.message : "Couldn't send your response");
    }
  };

  const remove = async () => {
    const what = event.recurring ? "this occurrence" : "this event";
    if (!window.confirm(`Delete ${what}${event.attendees.length ? " and notify guests" : ""}?`)) return;
    try {
      await del.mutateAsync({ calendarId: event.calendarId, eventId: event.id, notify: true });
      toast.success("Event deleted");
      void utils.calendar.events.invalidate();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the event");
    }
  };

  return (
    <aside className="flex h-full flex-col" aria-label="Event details">
      <div className="flex items-center gap-1 border-b px-3 py-2">
        {!event.readOnly && (
          <>
            <Button variant="ghost" size="icon" className="size-8" onClick={onEdit} aria-label="Edit event">
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => void remove()} disabled={del.isPending} aria-label="Delete event">
              <Trash2 className="size-4" />
            </Button>
          </>
        )}
        {event.htmlLink && (
          <Button variant="ghost" size="icon" className="size-8" asChild>
            <a href={event.htmlLink} target="_blank" rel="noreferrer noopener" aria-label="Open in provider">
              <ExternalLink className="size-4" />
            </a>
          </Button>
        )}
        <Button variant="ghost" size="icon" className="ml-auto size-8" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <div className="flex gap-3">
          <span className="mt-1.5 size-3 shrink-0 rounded" style={{ background: event.color }} />
          <div>
            <h2 className="text-lg font-semibold leading-snug tracking-tight">{event.title}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{when(event)}</p>
            {event.recurring && (
              <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
                <Repeat className="size-3" /> Repeats
              </p>
            )}
          </div>
        </div>

        {event.meetingUrl && (
          <Button asChild className="w-full gap-2">
            <a href={event.meetingUrl} target="_blank" rel="noreferrer noopener">
              <Video className="size-4" /> Join meeting
            </a>
          </Button>
        )}

        {event.location && (
          <p className="flex gap-2 text-[13px]">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="break-words">{event.location}</span>
          </p>
        )}

        {calendarName && (
          <p className="flex gap-2 text-[13px]">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {calendarName}
          </p>
        )}

        {isInvite && (
          <div>
            <p className="mb-2 text-[12px] font-medium text-muted-foreground">Going?</p>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Your response">
              {(
                [
                  ["accepted", "Yes", Check],
                  ["tentative", "Maybe", HelpCircle],
                  ["declined", "No", X],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={myResponse === value}
                  disabled={respond.isPending}
                  onClick={() => void rsvp(value)}
                  className={cn(
                    "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border text-[13px] font-medium transition-colors",
                    myResponse === value ? "border-brand bg-brand text-brand-foreground" : "hover:bg-muted",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {event.attendees.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
              <Users className="size-3.5" /> {event.attendees.length} guest{event.attendees.length === 1 ? "" : "s"}
            </p>
            <ul className="space-y-1.5">
              {event.organizer && (
                <li className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="truncate">{event.organizer.name || event.organizer.address}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">Organizer</span>
                </li>
              )}
              {event.attendees
                .filter((a) => a.email !== event.organizer?.address)
                .map((a) => (
                  <li key={a.email} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate">{a.name || a.email}</span>
                    <span
                      className={cn(
                        "shrink-0 text-[11px]",
                        a.response === "accepted" && "text-emerald-600 dark:text-emerald-400",
                        a.response === "declined" && "text-red-600 dark:text-red-400",
                        (!a.response || a.response === "noResponse" || a.response === "tentative") && "text-muted-foreground",
                      )}
                    >
                      {RESPONSE_LABEL[a.response ?? "noResponse"]}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {event.description && (
          <div className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-[13px] leading-relaxed text-foreground/90">
            {event.description.replace(/<[^>]*>/g, "")}
          </div>
        )}
      </div>
    </aside>
  );
}
