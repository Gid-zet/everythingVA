"use client";
import React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowRight,
  Columns3,
  FileInput,
  Globe,
  Inbox,
  Landmark,
  List as ListIcon,
  Loader2,
  Mail,
  Magnet,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TasksHeader, Segmented } from "@/app/tasks/components/tasks-header";
import { OPEN_STAGES, SOURCES, STAGES, stageInfo, type Lead, type LeadsStore, type Stage } from "./store";
import { LeadSheet } from "./lead-sheet";
import { FindLeadsDialog, FormsDialog, ProfileDialog, AddLeadDialog } from "./dialogs";

type Filter = { kind: "all" } | { kind: "stage"; stage: Stage } | { kind: "fit"; fit: "strong" } | { kind: "source"; source: Lead["source"] };

export function initials(l: Pick<Lead, "name" | "email">) {
  const s = (l.name ?? l.email ?? "?").replace(/@.*/, "");
  const p = s.split(/[\s._-]+/).filter(Boolean);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
}

const AVATAR = ["bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-teal-500", "bg-rose-500", "bg-indigo-500", "bg-emerald-500", "bg-orange-500"];
export function Avatar({ lead, size = "md" }: { lead: Pick<Lead, "name" | "email" | "id">; size?: "md" | "lg" }) {
  const n = [...lead.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold text-white", AVATAR[n % AVATAR.length], size === "lg" ? "size-11 text-sm" : "size-8 text-[11px]")}>
      {initials(lead)}
    </span>
  );
}

export function FitPill({ lead }: { lead: Pick<Lead, "fit" | "score"> }) {
  if (!lead.fit) return <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Not scored</span>;
  const tone =
    lead.fit === "strong"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : lead.fit === "possible"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium", tone)}>
      <span className="tabular-nums">{lead.score}</span>
      {lead.fit === "strong" ? "Strong fit" : lead.fit === "possible" ? "Possible" : "Poor fit"}
    </span>
  );
}

export function StagePill({ stage }: { stage: Stage }) {
  const s = stageInfo(stage);
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium", s.tone)}>{s.label}</span>;
}

export const ago = (d: Date | string | null) => {
  if (!d) return null;
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 30 ? `${days}d ago` : days < 365 ? `${Math.floor(days / 30)}mo ago` : `${Math.floor(days / 365)}y ago`;
};

export function LeadsApp({ store }: { store: LeadsStore }) {
  const [filter, setFilter] = React.useState<Filter>({ kind: "all" });
  const [view, setView] = React.useState<"list" | "board">("list");
  const [q, setQ] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<null | "find" | "profile" | "forms" | "add">(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [qualifying, setQualifying] = React.useState(false);
  const reduce = useReducedMotion();

  const leads = store.data?.leads ?? [];
  const profile = store.data?.profile ?? null;
  const icpReady = !!(profile?.offer.trim() && profile.idealCustomer.trim());

  const shown = leads
    .filter((l) =>
      filter.kind === "all"
        ? l.stage !== "lost" && l.stage !== "not_a_fit"
        : filter.kind === "stage"
          ? l.stage === filter.stage
          : filter.kind === "fit"
            ? l.fit === "strong" && OPEN_STAGES.includes(l.stage)
            : l.source === filter.source,
    )
    .filter((l) => {
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return [l.name, l.email, l.company, l.title, l.notes].some((v) => v?.toLowerCase().includes(s));
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const count = (fn: (l: Lead) => boolean) => leads.filter(fn).length;
  const open = count((l) => OPEN_STAGES.includes(l.stage));
  const strong = count((l) => l.fit === "strong" && OPEN_STAGES.includes(l.stage));
  const unscored = shown.filter((l) => !l.fit).map((l) => l.id);
  const won = count((l) => l.stage === "won");

  const title =
    filter.kind === "all" ? "Pipeline" : filter.kind === "stage" ? stageInfo(filter.stage).label : filter.kind === "fit" ? "Strong fits" : `From ${SOURCES[filter.source].toLowerCase()}`;

  async function qualify(ids: string[]) {
    if (!store.data?.aiConfigured) return toast.error("AI isn't configured on the server.");
    if (!icpReady) {
      setDialog("profile");
      return toast("Describe what you sell and who buys it first.");
    }
    setQualifying(true);
    let done = 0;
    for (let i = 0; i < ids.length; i += 10) {
      const r = await store.qualify(ids.slice(i, i + 10));
      done += r.filter((x) => x.ok).length;
    }
    setQualifying(false);
    setSelected(new Set());
    toast.success(`Scored ${done} ${done === 1 ? "lead" : "leads"}`);
  }

  const lead = leads.find((l) => l.id === openId) ?? null;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar leads={leads} filter={filter} setFilter={setFilter} forms={store.data?.forms.length ?? 0} onDialog={setDialog} icpReady={icpReady} />
      <main className="min-w-0 flex-1 bg-neutral-50 dark:bg-background">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
          <TasksHeader
            label="Leads"
            title={title}
            updatedAt={store.updatedAt || undefined}
            refreshing={store.refreshing}
            chips={[
              { label: "open", value: open, tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
              { label: "strong fits", value: strong, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
              { label: "replied", value: count((l) => l.stage === "replied"), tone: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" },
              { label: "won", value: won, tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
            ]}
            actions={
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => setDialog("add")} className="hidden items-center gap-1.5 rounded-xl bg-card px-3 py-2 text-[13px] font-medium ring-1 ring-border hover:bg-muted sm:flex">
                  <UserPlus className="size-4" /> Add
                </button>
                <button onClick={() => setDialog("find")} className="flex items-center gap-1.5 rounded-xl bg-foreground px-3.5 py-2 text-[13px] font-semibold text-background hover:opacity-90">
                  <Magnet className="size-4" /> Find leads
                </button>
              </div>
            }
          >
            {!icpReady && !store.loading && (
              <button onClick={() => setDialog("profile")} className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-card p-3.5 text-left ring-1 ring-border transition hover:ring-foreground/20">
                <span className="flex size-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                  <Target className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">Describe your ideal customer</span>
                  <span className="block text-[12px] text-muted-foreground">What you sell and who buys it. AI uses it to score every lead and explain why.</span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </button>
            )}
            <div className="-mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 md:hidden">
              {(
                [
                  [{ kind: "all" }, "Pipeline"],
                  [{ kind: "fit", fit: "strong" }, "Strong fits"],
                  ...OPEN_STAGES.map((s) => [{ kind: "stage", stage: s }, stageInfo(s).label] as const),
                ] as [Filter, string][]
              ).map(([f, l]) => (
                <button key={l} onClick={() => setFilter(f)} className={cn("shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium ring-1 ring-border", JSON.stringify(f) === JSON.stringify(filter) ? "bg-foreground text-background" : "bg-card")}>
                  {l}
                </button>
              ))}
              <button onClick={() => setDialog("profile")} className="shrink-0 rounded-lg bg-card px-2.5 py-1 text-[12px] font-medium ring-1 ring-border">Ideal customer</button>
              <button onClick={() => setDialog("forms")} className="shrink-0 rounded-lg bg-card px-2.5 py-1 text-[12px] font-medium ring-1 ring-border">Forms</button>
              <button onClick={() => setDialog("add")} className="shrink-0 rounded-lg bg-card px-2.5 py-1 text-[12px] font-medium ring-1 ring-border">Add</button>
            </div>
          </TasksHeader>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, notes" className="w-full rounded-xl bg-card py-2 pl-9 pr-3 text-sm outline-none ring-1 ring-border focus:ring-foreground/30" />
            </div>
            {selected.size > 0 ? (
              <>
                <button disabled={qualifying} onClick={() => qualify([...selected])} className="flex items-center gap-1.5 rounded-xl bg-card px-3 py-2 text-[13px] font-medium ring-1 ring-border hover:bg-muted">
                  {qualifying ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4 text-violet-500" />} Score {selected.size}
                </button>
                <button
                  onClick={() => {
                    if (!confirm(`Delete ${selected.size} ${selected.size === 1 ? "lead" : "leads"}? This can't be undone.`)) return;
                    store.remove([...selected]);
                    setSelected(new Set());
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-card px-3 py-2 text-[13px] font-medium text-rose-600 ring-1 ring-border hover:bg-muted"
                >
                  <Trash2 className="size-4" /> Delete
                </button>
              </>
            ) : (
              unscored.length > 0 && (
                <button disabled={qualifying} onClick={() => qualify(unscored.slice(0, 30))} className="flex items-center gap-1.5 rounded-xl bg-card px-3 py-2 text-[13px] font-medium ring-1 ring-border hover:bg-muted">
                  {qualifying ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4 text-violet-500" />} Score {Math.min(30, unscored.length)} unscored
                </button>
              )
            )}
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { id: "list", label: "List", icon: ListIcon },
                { id: "board", label: "Board", icon: Columns3 },
              ]}
            />
          </div>

          {store.loading ? (
            <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />
          ) : leads.length === 0 ? (
            <EmptyState onFind={() => setDialog("find")} onForms={() => setDialog("forms")} />
          ) : view === "list" ? (
            <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
              {shown.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing here.</p>}
              <AnimatePresence initial={false}>
                {shown.map((l) => (
                  <motion.div
                    key={l.id}
                    layout={reduce ? false : "position"}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="group flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${l.name ?? l.email}`}
                      checked={selected.has(l.id)}
                      onChange={(e) => {
                        const s = new Set(selected);
                        if (e.target.checked) s.add(l.id);
                        else s.delete(l.id);
                        setSelected(s);
                      }}
                      className={cn("size-4 accent-foreground transition-opacity", selected.size ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100")}
                    />
                    <button onClick={() => setOpenId(l.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <Avatar lead={l} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[14px] font-semibold">{l.name ?? l.email}</span>
                          {l.doNotContact && <span className="rounded bg-rose-100 px-1 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">DNC</span>}
                        </span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {[l.title, l.company].filter(Boolean).join(" · ") || l.email}
                          {l.fitReason ? <span className="hidden md:inline"> — {l.fitReason}</span> : null}
                        </span>
                      </span>
                      <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                        <FitPill lead={l} />
                        <StagePill stage={l.stage} />
                        <span className="w-20 text-right text-[11px] text-muted-foreground">{SOURCES[l.source]}</span>
                        <span className="w-16 text-right text-[11px] tabular-nums text-muted-foreground">{ago(l.lastContactAt) ?? "—"}</span>
                      </span>
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <Board leads={shown} onOpen={setOpenId} onMove={(id, stage) => store.update({ id, stage })} />
          )}
        </div>
      </main>

      <LeadSheet store={store} lead={lead} onClose={() => setOpenId(null)} onQualify={(id) => qualify([id])} qualifying={qualifying} />
      <FindLeadsDialog store={store} open={dialog === "find"} onClose={() => setDialog(null)} onForms={() => setDialog("forms")} onProfile={() => setDialog("profile")} />
      <ProfileDialog store={store} open={dialog === "profile"} onClose={() => setDialog(null)} />
      <FormsDialog store={store} open={dialog === "forms"} onClose={() => setDialog(null)} />
      <AddLeadDialog store={store} open={dialog === "add"} onClose={() => setDialog(null)} onCreated={(id) => setOpenId(id)} />
    </div>
  );
}

function Board({ leads, onOpen, onMove }: { leads: Lead[]; onOpen: (id: string) => void; onMove: (id: string, s: Stage) => void }) {
  const cols = STAGES.filter((s) => [...OPEN_STAGES, "won"].includes(s.id));
  const [over, setOver] = React.useState<Stage | null>(null);
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
      {cols.map((c) => {
        const items = leads.filter((l) => l.stage === c.id);
        return (
          <div
            key={c.id}
            onDragOver={(e) => (e.preventDefault(), setOver(c.id))}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/lead");
              setOver(null);
              if (id) onMove(id, c.id);
            }}
            className={cn("flex w-60 shrink-0 flex-col rounded-2xl bg-neutral-100/80 p-2 transition-colors dark:bg-muted/40", over === c.id && "bg-neutral-200 dark:bg-muted")}
          >
            <p className="flex items-center gap-1.5 px-1.5 pb-2 pt-1 text-[12px] font-semibold">
              <span className={cn("size-2 rounded-full", c.dot)} />
              {c.label}
              <span className="font-normal text-muted-foreground">{items.length}</span>
            </p>
            <div className="flex min-h-16 flex-col gap-2">
              {items.map((l) => (
                <motion.button
                  layout="position"
                  key={l.id}
                  draggable
                  onDragStart={(e) => (e as unknown as React.DragEvent).dataTransfer.setData("text/lead", l.id)}
                  onClick={() => onOpen(l.id)}
                  className="rounded-xl bg-card p-2.5 text-left shadow-sm ring-1 ring-border transition hover:ring-foreground/20"
                >
                  <span className="flex items-center gap-2">
                    <Avatar lead={l} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold">{l.name ?? l.email}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{l.company ?? l.email}</span>
                    </span>
                  </span>
                  <span className="mt-2 flex items-center justify-between">
                    <FitPill lead={l} />
                    <span className="text-[10px] text-muted-foreground">{SOURCES[l.source]}</span>
                  </span>
                  {l.nextStep && <span className="mt-1.5 line-clamp-2 block text-[11px] text-muted-foreground">→ {l.nextStep}</span>}
                </motion.button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ onFind, onForms }: { onFind: () => void; onForms: () => void }) {
  const tiles = [
    { icon: Globe, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", t: "The web", d: "Companies matching your ideal customer, researched and scored from their own sites.", on: onFind },
    { icon: Inbox, tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", t: "Your mailbox", d: "People you already talk to, ranked by how warm the conversation is.", on: onFind },
    { icon: Landmark, tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", t: "Tenders you track", d: "Buyer contacts named on procurement notices.", on: onFind },
    { icon: FileInput, tone: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", t: "An enquiry form", d: "Share a link; submissions arrive here with consent and campaign source.", on: onForms },
  ];
  return (
    <div className="rounded-2xl border border-dashed px-6 py-12 text-center">
      <Users className="mx-auto size-6 text-muted-foreground/60" />
      <p className="mt-3 text-sm font-medium">No leads yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Find companies that match your ideal customer, or start with people who already know you. Nothing is sent without you.</p>
      <div className="mx-auto mt-6 grid max-w-3xl gap-2.5 text-left sm:grid-cols-2">
        {tiles.map(({ icon: Icon, tone, t, d, on }) => (
          <button key={t} onClick={on} className="rounded-2xl bg-card p-3.5 ring-1 ring-border transition hover:ring-foreground/20">
            <span className={cn("flex size-8 items-center justify-center rounded-lg", tone)}>
              <Icon className="size-4" />
            </span>
            <span className="mt-2 block text-[13px] font-semibold">{t}</span>
            <span className="block text-[12px] text-muted-foreground">{d}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Sidebar({
  leads,
  filter,
  setFilter,
  forms,
  onDialog,
  icpReady,
}: {
  leads: Lead[];
  filter: Filter;
  setFilter: (f: Filter) => void;
  forms: number;
  onDialog: (d: "find" | "profile" | "forms" | "add") => void;
  icpReady: boolean;
}) {
  const is = (f: Filter) => JSON.stringify(f) === JSON.stringify(filter);
  const item = (f: Filter, label: React.ReactNode, n: number | null, icon: React.ReactNode) => (
    <button
      key={JSON.stringify(f)}
      onClick={() => setFilter(f)}
      className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors", is(f) ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {n !== null && n > 0 && <span className="text-[11px] tabular-nums text-muted-foreground">{n}</span>}
    </button>
  );
  const open = leads.filter((l) => l.stage !== "lost" && l.stage !== "not_a_fit").length;
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-card md:block">
      <div className="sticky top-0 flex max-h-screen flex-col overflow-y-auto">
        <div className="flex items-center gap-2 border-b px-4 py-3.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-background">
            <Magnet className="size-4" />
          </span>
          <span className="font-tight text-[15px] font-bold tracking-tight">Leads</span>
        </div>
        <nav className="space-y-0.5 p-2">
          {item({ kind: "all" }, "Pipeline", open, <Users className="size-4" />)}
          {item({ kind: "fit", fit: "strong" }, "Strong fits", leads.filter((l) => l.fit === "strong" && OPEN_STAGES.includes(l.stage)).length, <Sparkles className="size-4" />)}
        </nav>
        <p className="px-4 pb-1 pt-3 text-[11px] font-medium text-muted-foreground">Stages</p>
        <nav className="space-y-0.5 px-2">
          {STAGES.map((s) => item({ kind: "stage", stage: s.id }, s.label, leads.filter((l) => l.stage === s.id).length, <span className={cn("mx-1 size-2 rounded-full", s.dot)} />))}
        </nav>
        <p className="px-4 pb-1 pt-3 text-[11px] font-medium text-muted-foreground">Sources</p>
        <nav className="space-y-0.5 px-2">
          {(Object.keys(SOURCES) as Lead["source"][]).map((s) =>
            item(
              { kind: "source", source: s },
              SOURCES[s],
              leads.filter((l) => l.source === s).length,
              s === "web" ? <Globe className="size-4" /> : s === "inbox" ? <Inbox className="size-4" /> : s === "procurement" ? <Landmark className="size-4" /> : s === "form" ? <FileInput className="size-4" /> : s === "import" ? <ListIcon className="size-4" /> : <Plus className="size-4" />,
            ),
          )}
        </nav>
        <div className="mt-3 space-y-0.5 border-t p-2">
          <button onClick={() => onDialog("profile")} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-muted-foreground hover:bg-muted/60 hover:text-foreground">
            <Target className="size-4" />
            <span className="flex-1 text-left">Ideal customer</span>
            {!icpReady && <span className="size-1.5 rounded-full bg-violet-500" />}
          </button>
          <button onClick={() => onDialog("forms")} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-muted-foreground hover:bg-muted/60 hover:text-foreground">
            <FileInput className="size-4" />
            <span className="flex-1 text-left">Enquiry forms</span>
            {forms > 0 && <span className="text-[11px] tabular-nums">{forms}</span>}
          </button>
          <Link href="/tasks" className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-muted-foreground hover:bg-muted/60 hover:text-foreground">
            <ListIcon className="size-4" /> Tasks
          </Link>
          <Link href="/mail" className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-muted-foreground hover:bg-muted/60 hover:text-foreground">
            <Mail className="size-4" /> Back to mail
          </Link>
        </div>
      </div>
    </aside>
  );
}
