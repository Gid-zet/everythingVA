"use client";
import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Bell, CalendarClock, CalendarDays, CalendarRange, CheckCircle2, Flame, Hash, Inbox, LayoutGrid, List, ListTodo, Loader2, Mail, Plus, Tag, Trophy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageBanner, type BannerTone } from "@/components/page-banner";
import { addDays } from "@/lib/tasks/recurrence";
import { counts, inboxView, isOpen, labelView, projectView, todayView, upcomingView, compareTasks, type Group } from "@/lib/tasks/views";
import { Board } from "./board";
import { formatDayHeading, Kbd, PROJECT_COLORS, ProjectDot } from "./bits";
import { QuickAdd } from "./quick-add";
import { TaskDetail } from "./task-detail";
import { TaskRow } from "./task-row";
import dynamic from "next/dynamic";
import { ProgressCard } from "./progress-card";

// The progress page carries a chart library; load it only when opened.
const RemindersPanel = dynamic(() => import("./reminders-panel").then((m) => m.RemindersPanel), {
  ssr: false,
  loading: () => <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />,
});
const ProgressView = dynamic(() => import("./progress").then((m) => m.ProgressView), {
  ssr: false,
  loading: () => <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />,
});
import { localToday, type CreateInput, type Project, type Task, type TaskStore } from "./store";

type View = { kind: "inbox" | "today" | "upcoming" | "all" | "completed" | "progress" | "reminders" } | { kind: "project"; id: string } | { kind: "label"; label: string };

function readView(p: URLSearchParams): View {
  const v = p.get("view");
  if (v === "project" && p.get("id")) return { kind: "project", id: p.get("id")! };
  if (v === "label" && p.get("label")) return { kind: "label", label: p.get("label")! };
  if (v === "inbox" || v === "upcoming" || v === "all" || v === "completed" || v === "progress" || v === "reminders") return { kind: v };
  return { kind: "today" };
}
const BaseContext = React.createContext("/tasks");
const useViewHref = () => {
  const base = React.useContext(BaseContext);
  return (v: View) =>
    v.kind === "project" ? `${base}?view=project&id=${v.id}` : v.kind === "label" ? `${base}?view=label&label=${encodeURIComponent(v.label)}` : `${base}?view=${v.kind}`;
};

export function TasksApp({ store, basePath = "/tasks" }: { store: TaskStore; basePath?: string }) {
  return (
    <BaseContext.Provider value={basePath}>
      <TasksAppInner store={store} />
    </BaseContext.Provider>
  );
}

function TasksAppInner({ store }: { store: TaskStore }) {
  const base = React.useContext(BaseContext);
  const params = useSearchParams();
  const router = useRouter();
  const view = readView(params);
  const layout = params.get("layout") === "board" ? "board" : "list";
  const openId = params.get("task");
  const today = localToday();
  const quickAdd = React.useRef<HTMLInputElement>(null);
  const projectsById = React.useMemo(() => new Map(store.projects.map((p) => [p.id, p])), [store.projects]);
  const c = React.useMemo(() => counts(store.tasks, today), [store.tasks, today]);
  const labels = React.useMemo(() => Object.keys(c.byLabel).sort(), [c.byLabel]);
  const productivity = store.useProductivity();

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) v === null ? next.delete(k) : next.set(k, v);
    router.replace(`${base}?${next}`, { scroll: false });
  };
  const open = (id: string | null) => setParam({ task: id });
  const boardAllowed = view.kind === "inbox" || view.kind === "project" || view.kind === "all" || view.kind === "label";

  // Keyboard: Q = new task, B = list/board, Esc = close panel.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key === "q" || e.key === "Q") {
        e.preventDefault();
        quickAdd.current?.focus();
      } else if ((e.key === "b" || e.key === "B") && boardAllowed) {
        setParam({ layout: layout === "board" ? null : "board" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggle = (t: Task) => {
    const done = t.status === "done";
    store.update({ id: t.id, status: done ? "todo" : "done", today });
    if (!done)
      toast.success(t.recurrence ? `Completed “${t.title}”. Moved to its next date.` : `Completed “${t.title}”`, {
        action: t.recurrence ? undefined : { label: "Undo", onClick: () => store.update({ id: t.id, status: t.status, today }) },
      });
  };

  // What the current view shows, and what new tasks default to.
  let title = "Today";
  let subtitle: string | undefined;
  let groups: Group<Task>[] = [];
  let defaults: Partial<CreateInput> = {};
  let boardTasks: Task[] = [];
  if (view.kind === "today") {
    groups = todayView(store.tasks, today);
    subtitle = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    defaults = { dueDate: today };
  } else if (view.kind === "upcoming") {
    title = "Upcoming";
    subtitle = "Next 14 days";
    groups = upcomingView(store.tasks, today).map((g) => ({ ...g, label: g.key === "later" ? "Later" : formatDayHeading(g.key, today) }));
    defaults = { dueDate: addDays(today, 1) };
  } else if (view.kind === "inbox") {
    title = "Inbox";
    subtitle = "Tasks without a project";
    groups = [{ key: "inbox", label: "", tasks: inboxView(store.tasks) }];
    boardTasks = store.tasks.filter((t) => !t.projectId && !t.parentId && t.status !== "canceled");
  } else if (view.kind === "all") {
    title = "All tasks";
    const open = store.tasks.filter((t) => isOpen(t) && !t.parentId);
    groups = [
      { key: "dated", label: "Scheduled", tasks: open.filter((t) => t.dueDate).sort(compareTasks) },
      { key: "undated", label: "No date", tasks: open.filter((t) => !t.dueDate).sort((a, b) => a.sortOrder - b.sortOrder) },
    ];
    boardTasks = store.tasks.filter((t) => !t.parentId && t.status !== "canceled");
  } else if (view.kind === "completed") {
    title = "Completed";
    subtitle = "Last 14 days";
    const done = store.tasks.filter((t) => !isOpen(t)).sort((a, b) => String(b.completedAt ?? "").localeCompare(String(a.completedAt ?? "")));
    groups = [{ key: "done", label: "", tasks: done }];
  } else if (view.kind === "reminders") {
    title = "Reminders";
    subtitle = "Push notifications before tasks are due, and a morning email digest";
  } else if (view.kind === "progress") {
    title = "Progress";
    subtitle = "Points, goals, streaks and achievements";
  } else if (view.kind === "project") {
    const p = projectsById.get(view.id);
    title = p?.name ?? "Project";
    groups = projectView(store.tasks, view.id);
    defaults = { projectId: view.id };
    boardTasks = store.tasks.filter((t) => t.projectId === view.id && !t.parentId && t.status !== "canceled");
  } else if (view.kind === "label") {
    title = `@${view.label}`;
    groups = [{ key: "label", label: "", tasks: labelView(store.tasks, view.label) }];
    defaults = { labels: [view.label] };
    boardTasks = store.tasks.filter((t) => t.labels.includes(view.label) && !t.parentId && t.status !== "canceled");
  }
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  const openTask = openId ? (store.tasks.find((t) => t.id === openId) ?? null) : null;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar store={store} view={view} counts={c} labels={labels} productivity={productivity} />

      <main className="min-w-0 flex-1">
        <MobileNav view={view} projects={store.projects} />
        <div className={cn("mx-auto px-4 py-6 sm:px-8 sm:py-8", layout === "board" && boardAllowed ? "max-w-none" : "max-w-3xl")}>
          <PageBanner
            tone={VIEW_TONE[view.kind]}
            icon={VIEW_ICON[view.kind]}
            eyebrow="Tasks"
            title={title}
            description={subtitle}
            live={store.updatedAt ? { updatedAt: store.updatedAt, refreshing: store.refreshing } : null}
            stats={
              view.kind === "progress" || view.kind === "reminders"
                ? undefined
                : [
                    { label: view.kind === "completed" ? "Completed" : "In view", value: total },
                    { label: "Overdue", value: c.overdue },
                    ...(productivity?.settings.enabled
                      ? [
                          { label: "Done today", value: `${productivity.today.done}/${productivity.today.goal}` },
                          { label: "Streak", value: productivity.streak.current },
                        ]
                      : []),
                  ]
            }
            actions={
              boardAllowed ? (
                <div className="flex rounded-xl bg-white/15 p-0.5 ring-1 ring-inset ring-white/25" role="group" aria-label="Layout">
                  {(
                    [
                      ["list", List, "List"],
                      ["board", LayoutGrid, "Board"],
                    ] as const
                  ).map(([id, Icon, label]) => (
                    <button
                      key={id}
                      onClick={() => setParam({ layout: id === "list" ? null : "board" })}
                      aria-pressed={layout === id}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                        layout === id ? "bg-white text-foreground shadow-sm" : "text-white/85 hover:text-white",
                      )}
                    >
                      <Icon className="size-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              ) : undefined
            }
          />

          {view.kind === "today" && (
            <TodayActions
              overdue={store.tasks.filter((t) => isOpen(t) && t.dueDate && t.dueDate < today)}
              inbox={c.inbox}
              upcoming={c.upcoming}
              base={base}
              onReschedule={(list) => {
                for (const t of list) store.update({ id: t.id, dueDate: today, dueTime: t.dueTime, dueAt: t.dueTime ? new Date(`${today}T${t.dueTime}:00`) : null });
                toast.success(`Moved ${list.length} overdue ${list.length === 1 ? "task" : "tasks"} to today`);
              }}
            />
          )}

          {view.kind !== "completed" && view.kind !== "progress" && view.kind !== "reminders" && (
            <div className="mb-6">
              <QuickAdd ref={quickAdd} projects={store.projects} defaults={defaults} onCreate={store.create} />
            </div>
          )}

          {view.kind === "reminders" ? (
            <RemindersPanel />
          ) : view.kind === "progress" ? (
            <ProgressView data={productivity} store={store} />
          ) : store.loading ? (
            <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />
          ) : layout === "board" && boardAllowed ? (
            <Board tasks={boardTasks} store={store} today={today} projectsById={projectsById} onOpen={open} onToggle={toggle} showProject={view.kind !== "project"} />
          ) : total === 0 ? (
            <Empty view={view} />
          ) : (
            <div className="space-y-6">
              {groups.map((g) =>
                g.tasks.length || (view.kind === "upcoming" && g.key !== "later") ? (
                  <section key={g.key}>
                    {g.label && (
                      <h2 className={cn("mb-1 flex items-center gap-2 border-b pb-1.5 text-xs font-semibold", g.key === "overdue" && "text-[var(--viz-critical)]")}>
                        {g.label}
                        <span className="font-normal text-muted-foreground">{g.tasks.length || ""}</span>
                      </h2>
                    )}
                    {g.tasks.length ? (
                      <div className="-mx-2.5">
                        {g.tasks.map((t) => (
                          <TaskRow
                            key={t.id}
                            task={t}
                            today={today}
                            project={t.projectId ? projectsById.get(t.projectId) : undefined}
                            showProject={view.kind !== "project"}
                            selected={t.id === openId}
                            onOpen={() => open(t.id)}
                            onToggle={() => toggle(t)}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="py-1 text-xs text-muted-foreground/70">Nothing scheduled</p>
                    )}
                  </section>
                ) : null,
              )}
            </div>
          )}
        </div>
      </main>

      <TaskDetail task={openTask} store={store} onClose={() => open(null)} onOpen={open} />
    </div>
  );
}

const VIEW_TONE: Record<View["kind"], BannerTone> = {
  today: "indigo",
  inbox: "ocean",
  upcoming: "violet",
  all: "slate",
  completed: "emerald",
  progress: "sunset",
  reminders: "violet",
  project: "ocean",
  label: "rose",
};
const VIEW_ICON: Record<View["kind"], React.ElementType> = {
  today: CalendarDays,
  inbox: Inbox,
  upcoming: CalendarRange,
  all: ListTodo,
  completed: CheckCircle2,
  progress: Trophy,
  reminders: Bell,
  project: Hash,
  label: Tag,
};

/** One-click actions for the day (real changes, or straight to the work). */
function TodayActions({
  overdue,
  inbox,
  upcoming,
  base,
  onReschedule,
}: {
  overdue: Task[];
  inbox: number;
  upcoming: number;
  base: string;
  onReschedule: (tasks: Task[]) => void;
}) {
  const card =
    "group flex items-center gap-3 rounded-2xl border bg-gradient-to-br to-transparent p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md disabled:pointer-events-none disabled:opacity-50";
  const chip = "flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm";
  return (
    <div className="mb-6 grid gap-2.5 sm:grid-cols-2">
      <button type="button" className={cn(card, "from-rose-500/[0.08]")} disabled={!overdue.length} onClick={() => onReschedule(overdue)}>
        <span className={cn(chip, "from-rose-500 to-pink-600")}>
          <Flame className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold">{overdue.length ? `Move ${overdue.length} overdue to today` : "Nothing overdue"}</span>
          <span className="block text-[11px] text-muted-foreground">Keeps their times</span>
        </span>
      </button>
      <Link href={`${base}?view=inbox`} className={cn(card, "from-sky-500/[0.08]")}>
        <span className={cn(chip, "from-sky-500 to-cyan-600")}>
          <Inbox className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold">Triage inbox</span>
          <span className="block text-[11px] text-muted-foreground">{inbox ? `${inbox} without a project` : "Inbox zero"}</span>
        </span>
      </Link>
      <Link href={`${base}?view=upcoming`} className={cn(card, "from-violet-500/[0.08]")}>
        <span className={cn(chip, "from-violet-500 to-fuchsia-600")}>
          <CalendarClock className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold">Plan the week</span>
          <span className="block text-[11px] text-muted-foreground">{upcoming} due in the next 14 days</span>
        </span>
      </Link>
      <Link href="/mail" className={cn(card, "from-emerald-500/[0.08]")}>
        <span className={cn(chip, "from-emerald-500 to-teal-600")}>
          <Mail className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-[13px] font-semibold">
            Tasks from email <ArrowRight className="size-3" />
          </span>
          <span className="block text-[11px] text-muted-foreground">Open a thread, then Add task</span>
        </span>
      </Link>
    </div>
  );
}

function Empty({ view }: { view: View }) {
  const copy = {
    today: ["Nothing due today", "Enjoy the clear day, or plan something with the box above."],
    upcoming: ["Nothing in the next two weeks", "Tasks with a date show up here, grouped by day."],
    inbox: ["Inbox zero", "New tasks without a project land here."],
    all: ["No open tasks", "Add one above. Try “Send invoice friday p2 #Finance”."],
    completed: ["Nothing completed recently", "Completed tasks from the last 14 days appear here."],
    project: ["No open tasks in this project", "Add one above, or press B for the board."],
    label: ["No open tasks with this label", ""],
    progress: ["", ""],
    reminders: ["", ""],
  }[view.kind];
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
      <CheckCircle2 className="size-6 text-muted-foreground/60" />
      <p className="mt-3 text-sm font-medium">{copy[0]}</p>
      {copy[1] && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{copy[1]}</p>}
    </div>
  );
}

function NavLink({
  href,
  active,
  icon,
  label,
  count,
  tone,
  chip,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count?: number;
  tone?: "danger";
  /** Gradient classes for a coloured icon chip. */
  chip?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
        active ? "bg-background font-medium text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
      )}
    >
      {chip ? (
        <span className={cn("flex size-6 items-center justify-center rounded-md bg-gradient-to-br text-white shadow-sm [&_svg]:size-3.5", chip, !active && "opacity-85")}>{icon}</span>
      ) : (
        icon
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {!!count && <span className={cn("text-xs tabular-nums", tone === "danger" ? "text-[var(--viz-critical)]" : "text-muted-foreground")}>{count}</span>}
    </Link>
  );
}

function Sidebar({
  store,
  view,
  counts: c,
  labels,
  productivity,
}: {
  store: TaskStore;
  view: View;
  counts: ReturnType<typeof counts>;
  labels: string[];
  productivity: ReturnType<TaskStore["useProductivity"]>;
}) {
  const viewHref = useViewHref();
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const is = (k: View["kind"]) => view.kind === k;
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-sidebar md:block">
      <div className="sticky top-0 flex max-h-screen flex-col overflow-y-auto">
        <div className="flex items-center justify-between border-b px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-background">
              <ListTodo className="size-4" />
            </span>
            <span className="text-sm font-semibold">Tasks</span>
          </div>
          <Link href="/mail" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Mail className="size-3.5" /> Mail
          </Link>
        </div>
        <ProgressCard data={productivity} href={viewHref({ kind: "progress" })} />
        <nav className="space-y-0.5 p-2.5">
          <NavLink href={viewHref({ kind: "inbox" })} active={is("inbox")} chip="from-sky-500 to-cyan-600" icon={<Inbox className="size-4" />} label="Inbox" count={c.inbox} />
          <NavLink
            href={viewHref({ kind: "today" })}
            active={is("today")}
            chip="from-indigo-500 to-violet-600"
            icon={<CalendarDays className="size-4" />}
            label="Today"
            count={c.today}
            tone={c.overdue ? "danger" : undefined}
          />
          <NavLink href={viewHref({ kind: "upcoming" })} active={is("upcoming")} chip="from-violet-500 to-fuchsia-600" icon={<CalendarRange className="size-4" />} label="Upcoming" count={c.upcoming} />
          <NavLink href={viewHref({ kind: "all" })} active={is("all")} chip="from-slate-500 to-slate-700" icon={<ListTodo className="size-4" />} label="All tasks" />
          <NavLink href={viewHref({ kind: "completed" })} active={is("completed")} chip="from-emerald-500 to-teal-600" icon={<CheckCircle2 className="size-4" />} label="Completed" />
          <NavLink href={viewHref({ kind: "progress" })} active={is("progress")} chip="from-orange-500 to-pink-600" icon={<Trophy className="size-4" />} label="Progress" />
          <NavLink href={viewHref({ kind: "reminders" })} active={is("reminders")} chip="from-indigo-500 to-fuchsia-600" icon={<Bell className="size-4" />} label="Reminders" />
        </nav>

        <div className="px-2.5 pb-2">
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Projects</span>
            <button onClick={() => setAdding(true)} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Add project">
              <Plus className="size-3.5" />
            </button>
          </div>
          {adding && (
            <form
              className="mb-1 px-1"
              onSubmit={async (e) => {
                e.preventDefault();
                if (name.trim()) await store.saveProject({ name: name.trim() }).catch(() => undefined);
                setName("");
                setAdding(false);
              }}
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => !name && setAdding(false)}
                placeholder="Project name"
                className="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </form>
          )}
          <div className="space-y-0.5">
            {store.projects.map((p: Project) => (
              <div key={p.id} className="group relative">
                <NavLink
                  href={viewHref({ kind: "project", id: p.id })}
                  active={view.kind === "project" && view.id === p.id}
                  icon={<span className="flex size-4 items-center justify-center"><span className="size-2.5 rounded-full" style={{ background: PROJECT_COLORS[p.color] }} /></span>}
                  label={p.name}
                  count={c.byProject[p.id]}
                />
                <button
                  className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded bg-sidebar p-0.5 text-muted-foreground hover:text-foreground group-hover:block"
                  aria-label={`Delete project ${p.name}`}
                  onClick={() => confirm(`Delete the project “${p.name}”? Its tasks move to the Inbox.`) && store.deleteProject(p.id)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {!store.projects.length && !adding && <p className="px-2.5 py-1 text-xs text-muted-foreground">Type #name in a task to create one.</p>}
          </div>
        </div>

        {labels.length > 0 && (
          <div className="px-2.5 pb-4">
            <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Labels</p>
            <div className="space-y-0.5">
              {labels.map((l) => (
                <NavLink key={l} href={viewHref({ kind: "label", label: l })} active={view.kind === "label" && view.label === l} icon={<Tag className="size-4" />} label={l} count={c.byLabel[l]} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto space-y-1 border-t px-4 py-3 text-[11px] text-muted-foreground">
          <p>
            <Kbd>Q</Kbd> new task · <Kbd>B</Kbd> board · <Kbd>Esc</Kbd> close
          </p>
          <p>Type dates, “every friday”, p1–p4, #project, @label, 30m.</p>
        </div>
      </div>
    </aside>
  );
}

function MobileNav({ view, projects }: { view: View; projects: Project[] }) {
  const base = React.useContext(BaseContext);
  const items: [string, string][] = [
    ["today", "Today"],
    ["inbox", "Inbox"],
    ["upcoming", "Upcoming"],
    ["all", "All"],
    ["completed", "Done"],
    ["progress", "Progress"],
    ["reminders", "Reminders"],
  ];
  return (
    <div className="flex gap-1.5 overflow-x-auto border-b px-4 py-2.5 md:hidden">
      {items.map(([k, label]) => (
        <Link
          key={k}
          href={`${base}?view=${k}`}
          className={cn("shrink-0 rounded-full border px-3 py-1 text-xs", view.kind === k ? "bg-foreground text-background" : "text-muted-foreground")}
        >
          {label}
        </Link>
      ))}
      {projects.map((p) => (
        <Link
          key={p.id}
          href={`${base}?view=project&id=${p.id}`}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
            view.kind === "project" && view.id === p.id ? "bg-foreground text-background" : "text-muted-foreground",
          )}
        >
          <ProjectDot color={p.color} />
          {p.name}
        </Link>
      ))}
    </div>
  );
}
