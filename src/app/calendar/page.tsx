"use client";

import React from "react";
import Link from "next/link";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Menu,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { connectUrl, reconnectUrl } from "@/lib/connect-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModeToggle } from "@/components/theme-toggle";
import {
  AgendaDaysToShow,
  AgendaView,
  CalendarDndProvider,
  DayView,
  EventGap,
  EventHeight,
  MonthView,
  WeekCellsHeight,
  WeekView,
  type CalendarEvent,
  type CalendarView,
} from "@/components";
import { EventEditorDialog, type EventPreset, type RangeEvent } from "./components/event-editor";
import { EventDetails } from "./components/event-details";
import { MiniMonth } from "./components/mini-month";

const VIEWS: { value: CalendarView; label: string; key: string }[] = [
  { value: "day", label: "Day", key: "D" },
  { value: "week", label: "Week", key: "W" },
  { value: "month", label: "Month", key: "M" },
  { value: "agenda", label: "Agenda", key: "A" },
];

function rangeFor(view: CalendarView, date: Date) {
  if (view === "month") return { start: startOfWeek(startOfMonth(date)), end: addDays(endOfWeek(endOfMonth(date)), 1) };
  if (view === "week") return { start: startOfWeek(date), end: addDays(endOfWeek(date), 1) };
  if (view === "day") return { start: startOfDay(date), end: addDays(startOfDay(date), 1) };
  return { start: startOfDay(date), end: addDays(startOfDay(date), AgendaDaysToShow) };
}

const toLocal = (e: RangeEvent, which: "start" | "end") =>
  e.allDay ? new Date(`${e[which].slice(0, 10)}T00:00:00`) : new Date(e[which]);

export default function CalendarPage() {
  const utils = api.useUtils();
  const [view, setView] = React.useState<CalendarView>("week");
  const [date, setDate] = React.useState(() => new Date());
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [editor, setEditor] = React.useState<{ open: boolean; event?: RangeEvent | null; preset?: EventPreset }>({ open: false });
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Sidebar data + change version (bumped by provider webhooks and our own writes).
  const overview = api.calendar.overview.useQuery(undefined, { refetchInterval: 60_000, refetchOnWindowFocus: true });
  const version = overview.data?.version;
  const lastVersion = React.useRef<number | undefined>(undefined);
  React.useEffect(() => {
    if (version === undefined) return;
    if (lastVersion.current !== undefined && version !== lastVersion.current) void utils.calendar.events.invalidate();
    lastVersion.current = version;
  }, [version, utils]);

  const { start, end } = rangeFor(view, date);
  const events = api.calendar.events.useQuery(
    { timeMin: start.toISOString(), timeMax: end.toISOString() },
    { placeholderData: (prev) => prev, refetchInterval: 5 * 60_000, refetchOnWindowFocus: true },
  );
  const search = api.calendar.search.useQuery({ query: debounced }, { enabled: debounced.length >= 2 });

  const calendarsById = React.useMemo(() => {
    const m = new Map<string, { name: string; accountId: string }>();
    for (const a of overview.data?.accounts ?? []) for (const c of a.calendars) m.set(c.id, { name: c.name, accountId: a.id });
    return m;
  }, [overview.data]);

  // Optimistic overrides while a drag-and-drop reschedule is in flight.
  const [overrides, setOverrides] = React.useState<Record<string, { start: string; end: string }>>({});
  const rangeEvents = React.useMemo(
    () => (events.data?.events ?? []).map((e) => (overrides[e.key] ? { ...e, ...overrides[e.key] } : e)),
    [events.data, overrides],
  );
  const viewEvents: CalendarEvent[] = React.useMemo(
    () =>
      rangeEvents.map((e) => ({
        id: e.key,
        title: e.title,
        description: e.description ?? undefined,
        start: toLocal(e, "start"),
        // Views treat all-day ends as inclusive.
        end: e.allDay ? addDays(toLocal(e, "end"), -1) : toLocal(e, "end"),
        allDay: e.allDay,
        color: e.color as CalendarEvent["color"],
        location: e.location ?? undefined,
      })),
    [rangeEvents],
  );
  const selected = rangeEvents.find((e) => e.key === selectedKey) ?? null;
  const eventDays = React.useMemo(
    () => new Set(rangeEvents.map((e) => format(toLocal(e, "start"), "yyyy-MM-dd"))),
    [rangeEvents],
  );

  // Day/week views open at the working day rather than midnight.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if ((view === "week" || view === "day") && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, (new Date().getHours() - 1.5) * WeekCellsHeight);
    }
  }, [view, overview.isLoading]);

  const update = api.calendar.updateEvent.useMutation();
  const onDrop = async (moved: CalendarEvent) => {
    const original = rangeEvents.find((e) => e.key === moved.id);
    if (!original) return;
    if (original.readOnly) {
      toast.error("That calendar is read-only.");
      return;
    }
    const allDay = original.allDay;
    const next = {
      start: allDay ? format(moved.start, "yyyy-MM-dd") : moved.start.toISOString(),
      end: allDay ? format(addDays(moved.end, 1), "yyyy-MM-dd") : moved.end.toISOString(),
    };
    setOverrides((o) => ({ ...o, [original.key]: next }));
    try {
      await update.mutateAsync({
        calendarId: original.calendarId,
        eventId: original.id,
        notify: true,
        patch: { ...next, allDay, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      toast.success(`Moved to ${format(moved.start, allDay ? "EEE, MMM d" : "EEE, MMM d 'at' h:mm a")}`);
      await utils.calendar.events.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't move the event");
    } finally {
      setOverrides(({ [original.key]: _gone, ...rest }) => rest);
    }
  };

  const sync = api.calendar.syncCalendars.useMutation({
    onSuccess: (r) => {
      if (r.failures.length) toast.error(r.failures.join("\n"));
      else toast.success("Calendars up to date");
      void utils.calendar.overview.invalidate();
      void utils.calendar.events.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const setVisibility = api.calendar.setVisibility.useMutation({
    onMutate: async ({ calendarId, visible }) => {
      await utils.calendar.overview.cancel();
      utils.calendar.overview.setData(undefined, (d) =>
        d && {
          ...d,
          accounts: d.accounts.map((a) => ({
            ...a,
            calendars: a.calendars.map((c) => (c.id === calendarId ? { ...c, isVisible: visible } : c)),
          })),
        },
      );
    },
    onSettled: () => {
      void utils.calendar.overview.invalidate();
      void utils.calendar.events.invalidate();
    },
  });
  const setColor = api.calendar.setColor.useMutation({
    onSettled: () => {
      void utils.calendar.overview.invalidate();
      void utils.calendar.events.invalidate();
    },
  });

  // Navigation
  const step = (dir: 1 | -1) =>
    setDate((d) =>
      view === "month" ? (dir > 0 ? addMonths(d, 1) : subMonths(d, 1))
        : view === "week" ? (dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1))
          : addDays(d, dir * (view === "day" ? 1 : AgendaDaysToShow)),
    );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (editor.open || t?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "d" || k === "w" || k === "m" || k === "a") setView(VIEWS.find((v) => v.key.toLowerCase() === k)!.value);
      else if (k === "t") setDate(new Date());
      else if (k === "j" || e.key === "ArrowRight") step(1);
      else if (k === "k" || e.key === "ArrowLeft") step(-1);
      else if (k === "c") setEditor({ open: true });
      else if (e.key === "Escape") setSelectedKey(null);
      else if (k === "/") {
        e.preventDefault();
        document.getElementById("calendar-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.open, view]);

  const title =
    view === "month"
      ? format(date, "MMMM yyyy")
      : view === "week"
        ? isSameMonth(startOfWeek(date), endOfWeek(date))
          ? format(date, "MMMM yyyy")
          : `${format(startOfWeek(date), "MMM")} – ${format(endOfWeek(date), "MMM yyyy")}`
        : view === "day"
          ? format(date, "EEEE, MMMM d")
          : `${format(date, "MMM d")} – ${format(addDays(date, AgendaDaysToShow - 1), "MMM d, yyyy")}`;

  const accounts = overview.data?.accounts ?? [];
  const hasCalendars = accounts.some((a) => a.calendars.length > 0);
  const failing = events.data?.errors ?? [];

  const sidebar = (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <Button className="h-10 justify-start gap-2 rounded-xl shadow-sm" onClick={() => setEditor({ open: true })} disabled={!hasCalendars}>
        <Plus className="size-4" /> New event
        <kbd className="ml-auto rounded border border-white/20 px-1.5 font-sans text-[10px] opacity-70 dark:border-black/20">C</kbd>
      </Button>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          id="calendar-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events"
          className="h-9 rounded-lg border-transparent bg-muted/60 pl-8 text-[13px] shadow-none focus-visible:bg-background"
          aria-label="Search events"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-2.5 text-muted-foreground" aria-label="Clear search">
            <X className="size-4" />
          </button>
        )}
      </div>

      {debounced.length >= 2 ? (
        <div className="space-y-1">
          <p className="px-1 text-[11px] font-medium text-muted-foreground">
            {search.isFetching ? "Searching…" : `${search.data?.length ?? 0} result${search.data?.length === 1 ? "" : "s"}`}
          </p>
          {search.data?.map((e) => (
            <button
              key={e.key}
              type="button"
              onClick={() => {
                setDate(toLocal(e, "start"));
                setView("day");
                setSelectedKey(e.key);
                setSidebarOpen(false);
              }}
              className="flex w-full gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-foreground/[0.04]"
            >
              <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: e.color }} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{e.title}</span>
                <span className="text-[11px] text-muted-foreground">{format(toLocal(e, "start"), e.allDay ? "EEE, MMM d" : "EEE, MMM d · h:mm a")}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <MiniMonth selected={date} onSelect={setDate} eventDays={eventDays} />

          <div className="space-y-4">
            {accounts.map((a) => (
              <section key={a.id}>
                <div className="flex items-center gap-2 px-1">
                  <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-muted-foreground" title={a.emailAddress}>
                    {a.emailAddress}
                  </p>
                  {a.status === "needs_reauth" && (
                    <a href={reconnectUrl(a.id)} className="text-[11px] font-medium text-amber-700 hover:underline dark:text-amber-300">
                      Reconnect
                    </a>
                  )}
                </div>
                {a.calendars.length === 0 ? (
                  <p className="px-1 pt-1 text-[12px] text-muted-foreground">No calendars yet. Use Sync to load them.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {a.calendars.map((c) => (
                      <li key={c.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-foreground/[0.03]">
                        <input
                          type="checkbox"
                          checked={c.isVisible}
                          onChange={(e) => setVisibility.mutate({ calendarId: c.id, visible: e.target.checked })}
                          className="size-4 cursor-pointer rounded border-0"
                          style={{ accentColor: c.color ?? "#6366f1" }}
                          aria-label={`Show ${c.name}`}
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px]">{c.name}</span>
                        {c.isReadOnly && <span className="text-[10px] text-muted-foreground">view only</span>}
                        <label className="relative size-3.5 shrink-0 cursor-pointer rounded-full opacity-0 ring-1 ring-black/10 transition-opacity focus-within:opacity-100 group-hover:opacity-100" style={{ background: c.color ?? "#6366f1" }} title="Change colour">
                          <input
                            type="color"
                            value={c.color ?? "#6366f1"}
                            onChange={(e) => setColor.mutate({ calendarId: c.id, color: e.target.value })}
                            className="absolute inset-0 cursor-pointer opacity-0"
                            aria-label={`Colour for ${c.name}`}
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <div className="mt-auto space-y-2 border-t pt-3">
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => sync.mutate()} disabled={sync.isPending || !accounts.length}>
              <RefreshCw className={cn("size-4", sync.isPending && "animate-spin")} />
              {sync.isPending ? "Syncing…" : "Sync calendars"}
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2" asChild>
              <Link href="/mail">
                <Inbox className="size-4" /> Back to mail
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div
      className="flex h-screen overflow-hidden bg-background"
      style={
        {
          "--event-height": `${EventHeight}px`,
          "--event-gap": `${EventGap}px`,
          "--week-cells-height": `${WeekCellsHeight}px`,
        } as React.CSSProperties
      }
    >
      {/* Sidebar (drawer on small screens) */}
      <aside className="hidden w-[272px] shrink-0 border-r bg-sidebar lg:block">{sidebar}</aside>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Calendars">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[290px] bg-sidebar shadow-xl">{sidebar}</div>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
          <Button variant="ghost" size="icon" className="size-9 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open calendars">
            <Menu className="size-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setDate(new Date())}>
            Today
          </Button>
          <div className="flex">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => step(-1)} aria-label="Previous">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => step(1)} aria-label="Next">
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <h1 className="min-w-0 truncate text-[15px] font-semibold tracking-tight sm:text-lg">{title}</h1>
          {events.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading events" />}
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden rounded-lg bg-muted p-0.5 sm:flex" role="tablist" aria-label="View">
              {VIEWS.map((v) => (
                <button
                  key={v.value}
                  role="tab"
                  aria-selected={view === v.value}
                  title={`${v.label} (${v.key})`}
                  onClick={() => setView(v.value)}
                  className={cn(
                    "h-7 rounded-md px-3 text-[12px] font-medium transition-colors",
                    view === v.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <select
              className="h-8 rounded-md border bg-background px-2 text-[13px] sm:hidden"
              value={view}
              onChange={(e) => setView(e.target.value as CalendarView)}
              aria-label="View"
            >
              {VIEWS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
            <ModeToggle />
          </div>
        </header>

        {failing.length > 0 && (
          <div className="flex items-start gap-2 border-b bg-amber-500/10 px-4 py-2 text-[13px] text-amber-900 dark:text-amber-200" role="status">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">
              Couldn&apos;t load {failing.length} calendar{failing.length === 1 ? "" : "s"}:{" "}
              {failing.slice(0, 2).map((f) => `${calendarsById.get(f.calendarId)?.name ?? "calendar"} (${f.message})`).join("; ")}
            </span>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <div ref={scrollRef} className="min-w-0 flex-1 overflow-auto">
            {overview.isLoading ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : !accounts.length ? (
              <EmptyState />
            ) : !hasCalendars ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="text-sm font-medium">Your calendars haven&apos;t loaded yet</p>
                <p className="max-w-sm text-[13px] text-muted-foreground">
                  Sync to pull calendars from your connected accounts. IMAP-only mailboxes don&apos;t include a calendar.
                </p>
                <Button onClick={() => sync.mutate()} disabled={sync.isPending} className="gap-2">
                  <RefreshCw className={cn("size-4", sync.isPending && "animate-spin")} /> Sync calendars
                </Button>
              </div>
            ) : (
              <CalendarDndProvider onEventUpdate={(e) => void onDrop(e)}>
                <div className="flex min-h-full flex-col">
                  {view === "month" && (
                    <MonthView currentDate={date} events={viewEvents} onEventSelect={(e) => setSelectedKey(e.id)} onEventCreate={(d) => setEditor({ open: true, preset: { start: d } })} />
                  )}
                  {view === "week" && (
                    <WeekView currentDate={date} events={viewEvents} onEventSelect={(e) => setSelectedKey(e.id)} onEventCreate={(d) => setEditor({ open: true, preset: { start: d } })} />
                  )}
                  {view === "day" && (
                    <DayView currentDate={date} events={viewEvents} onEventSelect={(e) => setSelectedKey(e.id)} onEventCreate={(d) => setEditor({ open: true, preset: { start: d } })} />
                  )}
                  {view === "agenda" && <AgendaView currentDate={date} events={viewEvents} onEventSelect={(e) => setSelectedKey(e.id)} />}
                </div>
              </CalendarDndProvider>
            )}
          </div>

          {selected && (
            <div className="fixed inset-x-0 bottom-0 z-30 max-h-[75vh] rounded-t-2xl border-t bg-background shadow-2xl md:static md:max-h-none md:w-[340px] md:shrink-0 md:rounded-none md:border-l md:border-t-0 md:shadow-none">
              <EventDetails
                event={selected}
                calendarName={calendarsById.get(selected.calendarId)?.name}
                onClose={() => setSelectedKey(null)}
                onEdit={() => setEditor({ open: true, event: selected })}
              />
            </div>
          )}
        </div>
      </main>

      <EventEditorDialog
        open={editor.open}
        onOpenChange={(open) => setEditor((s) => ({ ...s, open }))}
        event={editor.event}
        preset={editor.preset}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div>
        <p className="text-base font-semibold">Connect a calendar</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
          See Google and Microsoft calendars side by side, schedule meetings, and answer invitations without leaving EverythingVA.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <a href={connectUrl("Google")}>Connect Google</a>
        </Button>
        <Button asChild variant="outline">
          <a href={connectUrl("Office365")}>Connect Microsoft</a>
        </Button>
        <Button asChild variant="outline">
          <a href={connectUrl("iCloud")}>Connect iCloud</a>
        </Button>
      </div>
    </div>
  );
}
