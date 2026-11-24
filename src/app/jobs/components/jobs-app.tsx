"use client";
import React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Briefcase, CalendarClock, Radar, Columns3, FileText, List as ListIcon, ListTodo, Loader2, Mail, MailSearch, Plus, Search, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { TasksHeader, Segmented } from "@/app/tasks/components/tasks-header";
import { needsFollowUp, pipelineStats, weeklyApplications } from "@/lib/jobs/pipeline";
import { BOARD_STAGES, CLOSED_STAGES, STAGES, stageInfo, type Job, type JobsStore, type Stage } from "./store";
import { JobSheet } from "./job-sheet";
import { AddJobDialog, CvDialog, InboxDialog } from "./dialogs";
import { DiscoverView } from "./discover-view";

type Filter = { kind: "all" } | { kind: "stage"; stage: Stage } | { kind: "followup" } | { kind: "closed" } | { kind: "discover" };

const LOGO = ["bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-teal-500", "bg-rose-500", "bg-indigo-500", "bg-emerald-500", "bg-orange-500"];
export function CompanyMark({ job, size = "md" }: { job: Pick<Job, "company" | "id">; size?: "md" | "lg" }) {
  const n = [...job.company].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-xl font-bold text-white", LOGO[n % LOGO.length], size === "lg" ? "size-11 text-base" : "size-8 text-xs")}>
      {job.company.replace(/[^A-Za-z0-9]/g, "").slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

export function MatchRing({ score, size = 30 }: { score: number | null; size?: number }) {
  if (score == null) return null;
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? "stroke-emerald-500" : score >= 50 ? "stroke-amber-500" : "stroke-rose-500";
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} title={`CV match ${score}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className="fill-none stroke-muted" strokeWidth={3} />
        <circle cx={size / 2} cy={size / 2} r={r} className={cn("fill-none transition-[stroke-dashoffset] duration-700", color)} strokeWidth={3} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="absolute text-[9px] font-bold tabular-nums">{score}</span>
    </span>
  );
}

export function Stars({ value, onChange, size = "sm" }: { value: number; onChange?: (v: number) => void; size?: "sm" | "md" }) {
  const icon = (i: number) => <Star className={cn(size === "md" ? "size-4" : "size-3", i <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />;
  // Read-only stars sit inside clickable cards, so they must not be buttons.
  if (!onChange)
    return (
      <span className="inline-flex" role="img" aria-label={`Excitement ${value} of 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <React.Fragment key={i}>{icon(i)}</React.Fragment>
        ))}
      </span>
    );
  return (
    <span className="inline-flex" aria-label={`Excitement ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={(e) => (e.stopPropagation(), onChange(value === i ? 0 : i))}
          className="hover:scale-110"
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
        >
          {icon(i)}
        </button>
      ))}
    </span>
  );
}

export const daysAgo = (d: Date | string | null) => {
  if (!d) return null;
  const n = Math.floor((Date.now() - new Date(d).getTime()) / 86400_000);
  return n <= 0 ? "today" : n === 1 ? "1 day ago" : `${n} days ago`;
};

export function JobsApp({ store }: { store: JobsStore }) {
  const [filter, setFilter] = React.useState<Filter>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "discover" ? { kind: "discover" } : { kind: "all" },
  );
  const [view, setView] = React.useState<"board" | "list">("board");
  const [q, setQ] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<null | "add" | "cv" | "inbox">(null);
  const reduce = useReducedMotion();

  const jobs = store.data?.jobs ?? [];
  const profile = store.data?.profile ?? null;
  const now = new Date();
  const stats = pipelineStats(jobs);
  const followUps = jobs.filter((j) => needsFollowUp(j, now));
  const weeks = weeklyApplications(jobs, now, 8);
  const maxWeek = Math.max(1, ...weeks.map((w) => w.count));

  const matches = (j: Job) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [j.title, j.company, j.location, j.notes].some((v) => v?.toLowerCase().includes(s));
  };
  const shown = jobs
    .filter((j) =>
      filter.kind === "all"
        ? !CLOSED_STAGES.includes(j.stage)
        : filter.kind === "stage"
          ? j.stage === filter.stage
          : filter.kind === "followup"
            ? needsFollowUp(j, now)
            : filter.kind === "closed" && CLOSED_STAGES.includes(j.stage),
    )
    .filter(matches);

  const title =
    filter.kind === "all" ? "Job search" : filter.kind === "stage" ? stageInfo(filter.stage).label : filter.kind === "followup" ? "Follow up" : filter.kind === "discover" ? "Discover" : "Closed";
  const newFinds = store.data?.discoveries.length ?? 0;
  const job = jobs.find((j) => j.id === openId) ?? null;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar jobs={jobs} filter={filter} setFilter={setFilter} followUps={followUps.length} newFinds={newFinds} hasCv={!!profile?.hasCv} onDialog={setDialog} />
      <main className="min-w-0 flex-1 bg-neutral-50 dark:bg-background">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
          <TasksHeader
            label="Jobs"
            title={title}
            updatedAt={store.updatedAt || undefined}
            refreshing={store.refreshing}
            chips={[
              { label: "applied", value: stats.applied, tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
              { label: "response rate", value: `${stats.responseRate}%`, tone: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
              { label: "interviews", value: stats.interviews, tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
              { label: "offers", value: stats.offers, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
            ]}
            actions={
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => setDialog("inbox")} className="hidden items-center gap-1.5 rounded-xl bg-card px-3 py-2 text-[13px] font-medium ring-1 ring-border hover:bg-muted sm:flex">
                  <MailSearch className="size-4" /> Check inbox
                </button>
                <button onClick={() => setDialog("add")} className="flex items-center gap-1.5 rounded-xl bg-foreground px-3.5 py-2 text-[13px] font-semibold text-background hover:opacity-90">
                  <Plus className="size-4" /> Add job
                </button>
              </div>
            }
          >
            <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
              <button onClick={() => setDialog("cv")} className="flex items-center gap-3 rounded-2xl bg-card p-3.5 text-left ring-1 ring-border transition hover:ring-foreground/20">
                <span className={cn("flex size-9 items-center justify-center rounded-xl", profile?.hasCv ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300")}>
                  <FileText className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{profile?.hasCv ? "My CV" : "Add your CV"}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{profile?.hasCv ? `${profile.resumeName ?? "Master CV"} · ${profile.cvWords} words` : "Needed for match scores and tailoring"}</span>
                </span>
              </button>
              <button onClick={() => setFilter({ kind: "followup" })} className="flex items-center gap-3 rounded-2xl bg-card p-3.5 text-left ring-1 ring-border transition hover:ring-foreground/20">
                <span className="flex size-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                  <CalendarClock className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{followUps.length ? `${followUps.length} to follow up` : "Nothing to chase"}</span>
                  <span className="block text-[12px] text-muted-foreground">Applied 7+ days ago, no reply</span>
                </span>
              </button>
              <div className="flex items-center gap-3 rounded-2xl bg-card p-3.5 ring-1 ring-border">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">Applications per week</span>
                  <span className="block text-[12px] text-muted-foreground">Last 8 weeks</span>
                </span>
                <span className="flex h-9 items-end gap-1" aria-label={weeks.map((w) => `${w.week}: ${w.count}`).join(", ")}>
                  {weeks.map((w, i) => (
                    <motion.span
                      key={w.week}
                      title={`Week of ${w.week}: ${w.count}`}
                      initial={reduce ? false : { height: 2 }}
                      animate={{ height: Math.max(3, (w.count / maxWeek) * 36) }}
                      transition={{ delay: i * 0.05, duration: 0.5 }}
                      className={cn("w-2 rounded-sm", i === weeks.length - 1 ? "bg-foreground" : "bg-sky-400/70")}
                    />
                  ))}
                </span>
              </div>
            </div>
            <div className="-mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 md:hidden">
              {(
                [
                  [{ kind: "all" }, "Pipeline"],
                  [{ kind: "discover" }, newFinds ? `Discover ${newFinds}` : "Discover"],
                  [{ kind: "followup" }, "Follow up"],
                  ...BOARD_STAGES.map((s) => [{ kind: "stage", stage: s }, stageInfo(s).label] as const),
                  [{ kind: "closed" }, "Closed"],
                ] as [Filter, string][]
              ).map(([f, l]) => (
                <button key={l} onClick={() => setFilter(f)} className={cn("shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium ring-1 ring-border", JSON.stringify(f) === JSON.stringify(filter) ? "bg-foreground text-background" : "bg-card")}>
                  {l}
                </button>
              ))}
              <button onClick={() => setDialog("inbox")} className="shrink-0 rounded-lg bg-card px-2.5 py-1 text-[12px] font-medium ring-1 ring-border">
                Check inbox
              </button>
            </div>
          </TasksHeader>

          <div className={cn("mb-4 flex flex-wrap items-center gap-2", filter.kind === "discover" && "hidden")}>
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search role, company, notes" className="w-full rounded-xl bg-card py-2 pl-9 pr-3 text-sm outline-none ring-1 ring-border focus:ring-foreground/30" />
            </div>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { id: "board", label: "Board", icon: Columns3 },
                { id: "list", label: "List", icon: ListIcon },
              ]}
            />
          </div>

          {store.loading ? (
            <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />
          ) : filter.kind === "discover" ? (
            <DiscoverView store={store} onSaved={(id) => setOpenId(id)} onEditCv={() => setDialog("cv")} />
          ) : jobs.length === 0 ? (
            <Empty onAdd={() => setDialog("add")} onCv={() => setDialog("cv")} hasCv={!!profile?.hasCv} />
          ) : view === "board" && filter.kind === "all" ? (
            <Board jobs={shown} onOpen={setOpenId} onMove={(id, stage) => store.update({ id, stage })} />
          ) : (
            <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
              {shown.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing here.</p>}
              <AnimatePresence initial={false}>
                {shown.map((j) => (
                  <motion.button
                    key={j.id}
                    layout={reduce ? false : "position"}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setOpenId(j.id)}
                    className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/50"
                  >
                    <CompanyMark job={j} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{j.title}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">{[j.company, j.location, j.salary].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-2 sm:flex">
                      <Stars value={j.excitement} />
                      <MatchRing score={j.matchScore} />
                      <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", stageInfo(j.stage).tone)}>{stageInfo(j.stage).label}</span>
                      <span className="w-20 text-right text-[11px] text-muted-foreground">{j.appliedAt ? daysAgo(j.appliedAt) : "not applied"}</span>
                    </span>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      <JobSheet store={store} job={job} onClose={() => setOpenId(null)} onNeedCv={() => setDialog("cv")} />
      <AddJobDialog store={store} open={dialog === "add"} onClose={() => setDialog(null)} onCreated={(id) => setOpenId(id)} />
      <CvDialog store={store} open={dialog === "cv"} onClose={() => setDialog(null)} />
      <InboxDialog store={store} open={dialog === "inbox"} onClose={() => setDialog(null)} onOpenJob={(id) => (setDialog(null), setOpenId(id))} />
    </div>
  );
}

function Board({ jobs, onOpen, onMove }: { jobs: Job[]; onOpen: (id: string) => void; onMove: (id: string, s: Stage) => void }) {
  const [over, setOver] = React.useState<Stage | null>(null);
  const now = new Date();
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
      {STAGES.filter((s) => BOARD_STAGES.includes(s.id)).map((c) => {
        const items = jobs.filter((j) => j.stage === c.id).sort((a, b) => b.excitement - a.excitement || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        return (
          <div
            key={c.id}
            onDragOver={(e) => (e.preventDefault(), setOver(c.id))}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/job");
              setOver(null);
              if (id) onMove(id, c.id);
            }}
            className={cn("flex w-64 shrink-0 flex-col rounded-2xl bg-neutral-100/80 p-2 transition-colors dark:bg-muted/40", over === c.id && "bg-neutral-200 dark:bg-muted")}
          >
            <p className="flex items-center gap-1.5 px-1.5 pb-2 pt-1 text-[12px] font-semibold">
              <span className={cn("size-2 rounded-full", c.dot)} />
              {c.label}
              <span className="font-normal text-muted-foreground">{items.length}</span>
            </p>
            <div className="flex min-h-20 flex-col gap-2">
              {items.map((j) => {
                const stale = needsFollowUp(j, now);
                const due = j.deadline ? Math.ceil((new Date(j.deadline).getTime() - now.getTime()) / 86400_000) : null;
                return (
                  <motion.button
                    layout="position"
                    key={j.id}
                    draggable
                    onDragStart={(e) => (e as unknown as React.DragEvent).dataTransfer.setData("text/job", j.id)}
                    onClick={() => onOpen(j.id)}
                    className="rounded-xl bg-card p-3 text-left shadow-sm ring-1 ring-border transition hover:-translate-y-0.5 hover:ring-foreground/20"
                  >
                    <span className="flex items-start gap-2.5">
                      <CompanyMark job={j} />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block text-[13px] font-semibold leading-snug">{j.title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{j.company}</span>
                      </span>
                      <MatchRing score={j.matchScore} size={28} />
                    </span>
                    <span className="mt-2 flex items-center justify-between gap-2">
                      <Stars value={j.excitement} />
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        {j._count.documents > 0 && (
                          <span className="inline-flex items-center gap-0.5" title={`${j._count.documents} documents`}>
                            <FileText className="size-3" />
                            {j._count.documents}
                          </span>
                        )}
                        {j.threadIds.length > 0 && <Mail className="size-3" aria-label="Linked emails" />}
                      </span>
                    </span>
                    {(stale || (due !== null && due >= 0 && due <= 7 && j.stage === "saved") || j.nextAction) && (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {stale && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">Follow up</span>}
                        {due !== null && due >= 0 && due <= 7 && j.stage === "saved" && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Closes in {due}d</span>
                        )}
                        {j.nextAction && <span className="line-clamp-1 text-[10px] text-muted-foreground">→ {j.nextAction}</span>}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ onAdd, onCv, hasCv }: { onAdd: () => void; onCv: () => void; hasCv: boolean }) {
  const steps = [
    { n: 1, t: "Add your CV", d: "Upload a PDF or Word file once. It's the only source of facts AI uses.", on: onCv, done: hasCv },
    { n: 2, t: "Save a job", d: "Paste a link from Greenhouse, Lever, a company careers page and more, or paste the description.", on: onAdd, done: false },
    { n: 3, t: "Tailor and apply", d: "See your match score and missing keywords, then get a tailored CV and cover letter.", on: onAdd, done: false },
  ];
  return (
    <div className="rounded-2xl border border-dashed px-6 py-12 text-center">
      <Briefcase className="mx-auto size-6 text-muted-foreground/60" />
      <p className="mt-3 text-sm font-medium">Track every application in one place</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Recruiter emails in your inbox can move applications forward for you, once you confirm.</p>
      <div className="mx-auto mt-6 grid max-w-3xl gap-2.5 text-left sm:grid-cols-3">
        {steps.map((s) => (
          <button key={s.n} onClick={s.on} className="rounded-2xl bg-card p-3.5 ring-1 ring-border transition hover:ring-foreground/20">
            <span className={cn("flex size-7 items-center justify-center rounded-full text-[12px] font-bold", s.done ? "bg-emerald-500 text-white" : "bg-foreground text-background")}>{s.done ? "✓" : s.n}</span>
            <span className="mt-2 block text-[13px] font-semibold">{s.t}</span>
            <span className="block text-[12px] text-muted-foreground">{s.d}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Sidebar({
  jobs,
  filter,
  setFilter,
  followUps,
  newFinds,
  hasCv,
  onDialog,
}: {
  jobs: Job[];
  filter: Filter;
  setFilter: (f: Filter) => void;
  followUps: number;
  newFinds: number;
  hasCv: boolean;
  onDialog: (d: "add" | "cv" | "inbox") => void;
}) {
  const is = (f: Filter) => JSON.stringify(f) === JSON.stringify(filter);
  const item = (f: Filter, label: string, n: number, icon: React.ReactNode) => (
    <button
      key={label}
      onClick={() => setFilter(f)}
      className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors", is(f) ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {n > 0 && <span className="text-[11px] tabular-nums text-muted-foreground">{n}</span>}
    </button>
  );
  const link = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-muted-foreground hover:bg-muted/60 hover:text-foreground";
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-card md:block">
      <div className="sticky top-0 flex max-h-screen flex-col overflow-y-auto">
        <div className="flex items-center gap-2 border-b px-4 py-3.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-background">
            <Briefcase className="size-4" />
          </span>
          <span className="font-tight text-[15px] font-bold tracking-tight">Jobs</span>
        </div>
        <nav className="space-y-0.5 p-2">
          {item({ kind: "all" }, "Pipeline", jobs.filter((j) => !CLOSED_STAGES.includes(j.stage)).length, <Columns3 className="size-4" />)}
          {item({ kind: "discover" }, "Discover", newFinds, <Radar className="size-4" />)}
          {item({ kind: "followup" }, "Follow up", followUps, <CalendarClock className="size-4" />)}
        </nav>
        <p className="px-4 pb-1 pt-3 text-[11px] font-medium text-muted-foreground">Stages</p>
        <nav className="space-y-0.5 px-2">
          {STAGES.filter((s) => BOARD_STAGES.includes(s.id)).map((s) => item({ kind: "stage", stage: s.id }, s.label, jobs.filter((j) => j.stage === s.id).length, <span className={cn("mx-1 size-2 rounded-full", s.dot)} />))}
          {item({ kind: "closed" }, "Closed", jobs.filter((j) => CLOSED_STAGES.includes(j.stage)).length, <span className="mx-1 size-2 rounded-full bg-neutral-300" />)}
        </nav>
        <div className="mt-3 space-y-0.5 border-t p-2">
          <button onClick={() => onDialog("cv")} className={link}>
            <FileText className="size-4" />
            <span className="flex-1 text-left">My CV</span>
            {!hasCv && <span className="size-1.5 rounded-full bg-violet-500" />}
          </button>
          <button onClick={() => onDialog("inbox")} className={link}>
            <MailSearch className="size-4" /> Check inbox
          </button>
          <Link href="/tasks" className={link}>
            <ListTodo className="size-4" /> Tasks
          </Link>
          <Link href="/mail" className={link}>
            <Mail className="size-4" /> Back to mail
          </Link>
        </div>
      </div>
    </aside>
  );
}
