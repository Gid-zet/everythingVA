"use client";
import React from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CalendarClock,
  Cog,
  Info,
  Loader2,
  Lock,
  Minus,
  Gauge,
  Target,
  RefreshCw,
  Rocket,
  ShieldAlert,
  User,
  Wallet,
  Filter,
  PieChart,
  Medal,
  Hourglass,
  Bell,
  Globe2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RouterOutputs } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { SOURCE_LABELS } from "@/server/procurement/types";
import { EligibilityBadge, EmptyState, formatDate, money, relativeDays } from "./bits";
import { DiscoveryTrend, FitBar, FitHistogram, Meter, PipelineFunnel, SegmentedBar, type Segment } from "./dashboard-charts";
import { CountUp, LiveBadge, useNewIds, useNow } from "./live";
import { QuickActions, type QuickActionsState } from "./quick-actions";

/* Layout follows the single-metric-first pattern (Stripe, Vercel): one hero
   number with its trend, a strip of supporting KPIs, then breakdowns and
   work queues. Every figure comes from stored data; nothing is estimated. */

function Panel({
  title,
  subtitle,
  action,
  children,
  className,
  icon: Icon,
  tone = "from-sky-500 to-blue-600",
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  icon?: React.ElementType;
  tone?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-2xl border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03)]", className)}>
      <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon && (
            <span className={cn("mt-px flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm", tone)}>
              <Icon className="size-3.5" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {action}
      </header>
      <div className="min-h-0 flex-1 px-5 pb-5">{children}</div>
    </section>
  );
}

function Delta({ current, previous, label }: { current: number; previous: number; label: string }) {
  const diff = current - previous;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium tabular-nums",
          diff > 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : diff < 0 ? "bg-muted text-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-3" />
        {diff > 0 ? `+${diff}` : diff}
      </span>
      {label}
    </span>
  );
}

const TILE_TONES = {
  emerald: { chip: "from-emerald-500 to-teal-600", wash: "from-emerald-500/[0.10]", bar: "bg-emerald-500" },
  violet: { chip: "from-violet-500 to-fuchsia-600", wash: "from-violet-500/[0.10]", bar: "bg-violet-500" },
  blue: { chip: "from-sky-500 to-blue-600", wash: "from-blue-500/[0.10]", bar: "bg-blue-500" },
  amber: { chip: "from-amber-400 to-orange-500", wash: "from-amber-500/[0.12]", bar: "bg-amber-500" },
} as const;

function StatTile({
  label,
  value,
  foot,
  href,
  children,
  tone = "blue",
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
  href?: string;
  children?: React.ReactNode;
  tone?: keyof typeof TILE_TONES;
  icon?: React.ElementType;
}) {
  const t = TILE_TONES[tone];
  const body = (
    <>
      <span className={cn("absolute inset-x-0 top-0 h-1", t.bar)} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm", t.chip)}>
            <Icon className="size-4" />
          </span>
        )}
        {children}
      </div>
      <p className="mt-1 text-[28px] font-semibold leading-none tracking-tight">{value}</p>
      {foot && <div className="mt-2 text-xs text-muted-foreground">{foot}</div>}
    </>
  );
  const cls = cn("relative block overflow-hidden rounded-2xl border bg-card bg-gradient-to-br to-transparent p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all", t.wash);
  return href ? (
    <Link href={href} className={cn(cls, "hover:-translate-y-0.5 hover:shadow-md")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const ACTOR_ICON = { user: User, ai: Bot, system: Cog };
const ACTOR_TONE = {
  user: "from-emerald-500 to-teal-600",
  ai: "from-violet-500 to-fuchsia-600",
  system: "from-sky-500 to-blue-600",
};

function ago(d: Date | string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(d).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return formatDate(d);
}

export type DashboardOverview = RouterOutputs["procurement"]["overview"];
export type DashboardAnalytics = RouterOutputs["procurement"]["analytics"];

export function DashboardView({
  o,
  a,
  actions,
  live,
  agentStatus,
}: {
  o: DashboardOverview;
  a: DashboardAnalytics;
  actions: QuickActionsState;
  live: { updatedAt: number; refreshing: boolean };
  /** What an agent is doing right now, e.g. "Qualification agent 2/5". */
  agentStatus?: string | null;
}) {
  const now = useNow(15_000);
  const freshIds = useNewIds(a.activity.map((x) => x.id));
  const s = o.stats;
  const canRun = o.hasProfile && o.workspace.role !== "viewer";
  const lastRun = o.lastRuns[0];
  const activeTotal = a.fit.active;
  const pursuing = a.funnel.stages.filter((st) => st.key === "pursuing" || st.key === "submitted").reduce((n, st) => n + st.count, 0);

  const eligibilitySegments: Segment[] = [
    { key: "qualified", label: "Qualified", value: a.eligibility.qualified, color: "var(--viz-good)", ink: "light" },
    { key: "potentially_qualified", label: "Potentially qualified", value: a.eligibility.potentially_qualified, color: "var(--viz-1)", ink: "light" },
    { key: "requires_clarification", label: "Needs clarification", value: a.eligibility.requires_clarification, color: "var(--viz-warning)", ink: "dark" },
    { key: "not_qualified", label: "Not qualified", value: a.eligibility.not_qualified, color: "var(--viz-critical)", ink: "light" },
    { key: "unscored", label: "Not assessed", value: a.eligibility.unscored, color: "var(--viz-neutral)", ink: "auto" },
  ];
  const sourceSegments: Segment[] = [
    { key: "sam_gov", label: "SAM.gov", value: a.sources.sam_gov, color: "var(--viz-1)", ink: "light" },
    { key: "canadabuys", label: "CanadaBuys", value: a.sources.canadabuys, color: "var(--viz-2)", ink: "light" },
    { key: "manual", label: "Added manually", value: a.sources.manual, color: "var(--viz-3)", ink: "auto" },
  ];
  const r = a.readiness;
  const readinessScore = Math.round(
    ((r.profile.filled / r.profile.total) * 0.4 + (r.credentials.total ? r.credentials.valid / r.credentials.total : 0) * 0.3 + (r.documents.total ? r.documents.valid / r.documents.total : 0) * 0.3) * 100,
  );

  return (
    <div className="space-y-5">
      {/* Live banner */}
      <section className="relative overflow-hidden rounded-3xl p-6 text-white shadow-lg sm:p-7" style={{ background: "linear-gradient(120deg, #312e81 0%, #4f46e5 38%, #7c3aed 68%, #0ea5e9 100%)" }}>
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-fuchsia-400/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 size-72 rounded-full bg-sky-300/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" aria-hidden />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <LiveBadge updatedAt={live.updatedAt} refreshing={live.refreshing} />
              {agentStatus && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ring-white/25">
                  <Loader2 className="size-3 animate-spin" />
                  {agentStatus}
                </span>
              )}
            </div>
            <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.16em] text-white/70">Procurement · {o.workspace.name}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Pipeline overview</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {[
                { on: !!lastRun && !lastRun.error, label: lastRun ? `Last search ${formatDate(lastRun.startedAt, true)}` : "Not searched yet" },
                { on: o.sources.samGov, label: `SAM.gov ${o.sources.samGov ? "on" : "off"}` },
                { on: true, label: "CanadaBuys on" },
                { on: true, label: "Daily search 11:00 UTC" },
                { on: o.aiConfigured, label: o.aiConfigured ? "AI agent ready" : "AI not configured" },
              ].map((c) => (
                <span key={c.label} className="inline-flex items-center gap-1.5 rounded-full bg-black/15 px-2.5 py-1 ring-1 ring-inset ring-white/15">
                  <span className={cn("size-1.5 rounded-full", c.on ? "bg-emerald-300" : "bg-amber-300")} aria-hidden />
                  {c.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-end gap-6">
            <div>
              <p className="text-xs text-white/70">Active opportunities</p>
              <p className="text-5xl font-semibold leading-none tracking-tight">
                <CountUp value={activeTotal} />
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="secondary" className="bg-white/15 text-white ring-1 ring-inset ring-white/25 hover:bg-white/25">
                <Link href="/procurement/opportunities">
                  Opportunities <ArrowRight className="ml-1.5 size-4" />
                </Link>
              </Button>
              <Button onClick={actions.find.run} disabled={!canRun || actions.find.running} className="bg-white text-indigo-700 hover:bg-white/90">
                {actions.find.running ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
                {actions.find.running ? "Searching…" : "Find now"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <QuickActions s={actions} />

      {!o.hasProfile && (
        <div className="flex flex-col gap-3 rounded-2xl border border-brand/30 bg-brand-soft p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Start with your company profile</p>
            <p className="mt-1 text-sm text-muted-foreground">Discovery and qualification use your services, keywords, codes and verified certifications.</p>
          </div>
          <Button asChild size="sm">
            <Link href="/procurement/profile">Set up the profile</Link>
          </Button>
        </div>
      )}

      {/* Hero + readiness */}
      <div className="grid gap-5 lg:grid-cols-12">
        <section className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] lg:col-span-8">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-90 [background:radial-gradient(55%_100%_at_15%_0%,rgba(59,130,246,0.14),transparent),radial-gradient(45%_90%_at_85%_0%,rgba(168,85,247,0.12),transparent)]"
            aria-hidden
          />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex size-6 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white">
                  <Activity className="size-3.5" />
                </span>
                New opportunities, last 7 days
              </p>
              <p className="mt-2 text-5xl font-semibold leading-none tracking-tight">
                <CountUp value={a.week.current} />
              </p>
              <div className="mt-3">
                <Delta current={a.week.current} previous={a.week.previous} label="vs the 7 days before" />
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">
                  <CountUp value={s.total} />
                </span>{" "}
                found in total
              </p>
              <p className="mt-0.5">Discovered per day, last 30 days</p>
            </div>
          </div>
          <div className="relative mt-4">
            <DiscoveryTrend data={a.trend} />
          </div>
        </section>

        <Panel
          title="Bid readiness"
          subtitle="How ready your verified profile is for agents and applications"
          className="lg:col-span-4"
          icon={Gauge}
          tone="from-emerald-500 to-teal-600"
          action={
            <span
              className="bg-clip-text text-2xl font-semibold leading-none tracking-tight text-transparent"
              style={{ backgroundImage: "linear-gradient(90deg, #059669, #0ea5e9)" }}
            >
              <CountUp value={readinessScore} />%
            </span>
          }
        >
          <div className="space-y-4">
            <Meter label="Company profile" value={r.profile.filled} total={r.profile.total} detail="Fields discovery and qualification rely on" />
            <Meter label="Credentials verified" value={r.credentials.valid} total={r.credentials.total} detail="Verified and unexpired; agents ignore the rest" />
            <Meter label="Documents verified" value={r.documents.valid} total={r.documents.total} detail="Latest versions in the knowledge base" />
          </div>
          <div className="mt-4 flex gap-2">
            <Button asChild size="sm" variant="outline" className="flex-1">
              <Link href="/procurement/profile">Profile</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="flex-1">
              <Link href="/procurement/knowledge">Documents</Link>
            </Button>
          </div>
        </Panel>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          tone="emerald"
          icon={Target}
          label="Qualified or potentially qualified"
          value={<CountUp value={s.qualified} />}
          href="/procurement/opportunities?eligibility=eligible"
          foot={s.needsClarification ? <span className="text-amber-700 dark:text-amber-300">{s.needsClarification} more need clarification</span> : "Ready for a bid decision"}
        />
        <StatTile
          tone="violet"
          icon={Gauge}
          label="Average fit score"
          value={a.fit.average !== null ? <CountUp value={a.fit.average} /> : "–"}
          foot={`${a.fit.assessed} of ${activeTotal} active assessed`}
          href="/procurement/opportunities?sort=fit"
        />
        <StatTile
          tone="blue"
          icon={Rocket}
          label="In pursuit"
          value={<CountUp value={pursuing} />}
          foot={`${s.submitted} submitted · ${s.awarded} awarded`}
          href="/procurement/opportunities?status=proposal_in_progress"
        />
        <StatTile
          tone="amber"
          icon={Wallet}
          label="Pipeline value"
          value={s.pipelineValueCount ? <CountUp value={s.pipelineValue} format={(n) => money(n)} /> : "–"}
          foot={
            a.winRate
              ? `Win rate ${Math.round((a.winRate.awarded / a.winRate.decided) * 100)}% (${a.winRate.awarded}/${a.winRate.decided})`
              : s.pipelineValueCount
                ? `${s.pipelineValueCount} with a published value`
                : "Most notices don't publish a value"
          }
        />
      </div>

      {/* Funnel + fit */}
      <div className="grid gap-5 lg:grid-cols-12">
        <Panel title="Pipeline funnel" subtitle="Where every opportunity stands, in order" className="lg:col-span-7" icon={Filter} tone="from-sky-500 to-blue-600">
          <PipelineFunnel stages={a.funnel.stages} />
          <dl className="mt-5 grid grid-cols-3 gap-3 border-t pt-4">
            {[
              { label: "Assessed by the agent", value: a.fit.active ? `${Math.round((a.fit.assessed / a.fit.active) * 100)}%` : "–", note: `${a.fit.assessed} of ${a.fit.active} active` },
              {
                label: "Eligible of assessed",
                value: a.fit.assessed ? `${Math.round(((a.eligibility.qualified + a.eligibility.potentially_qualified) / a.fit.assessed) * 100)}%` : "–",
                note: `${a.eligibility.qualified + a.eligibility.potentially_qualified} qualified or potentially`,
              },
              {
                label: "Win rate",
                value: a.winRate ? `${Math.round((a.winRate.awarded / a.winRate.decided) * 100)}%` : "–",
                note: a.winRate ? `${a.winRate.awarded} of ${a.winRate.decided} decided` : "No decisions yet",
              },
            ].map((m) => (
              <div key={m.label} className="min-w-0">
                <dt className="text-[11px] leading-tight text-muted-foreground">{m.label}</dt>
                <dd className="mt-1 text-lg font-semibold leading-none tracking-tight">{m.value}</dd>
                <dd className="mt-1 text-[11px] leading-tight text-muted-foreground">{m.note}</dd>
              </div>
            ))}
          </dl>
          {a.funnel.closed.declined + a.funnel.closed.unsuccessful + a.funnel.closed.withdrawn > 0 && (
            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              Closed: {a.funnel.closed.declined} declined · {a.funnel.closed.unsuccessful} unsuccessful · {a.funnel.closed.withdrawn} withdrawn
            </p>
          )}
        </Panel>
        <Panel
          title="Fit and eligibility"
          subtitle={`Qualification agent results across ${activeTotal} active opportunities`}
          className="lg:col-span-5"
          icon={PieChart}
          tone="from-violet-500 to-fuchsia-600"
        >
          <SegmentedBar segments={eligibilitySegments} />
          <div className="mt-5 border-t pt-4">
            <p className="mb-1 text-xs font-medium">Fit score distribution</p>
            {a.fit.assessed ? <FitHistogram data={a.fit.histogram} /> : <p className="py-8 text-center text-xs text-muted-foreground">No opportunities assessed yet.</p>}
          </div>
        </Panel>
      </div>

      {/* Top matches + deadlines */}
      <div className="grid gap-5 lg:grid-cols-12">
        <Panel
          title="Best matches"
          subtitle="Highest fit, still open"
          className="lg:col-span-7"
          icon={Medal}
          tone="from-amber-400 to-orange-500"
          action={
            <Link href="/procurement/opportunities?sort=fit" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              All <ArrowRight className="size-3" />
            </Link>
          }
        >
          {a.topMatches.length ? (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[560px] table-fixed text-sm">
                <colgroup>
                  <col />
                  <col className="w-28" />
                  <col className="w-40" />
                  <col className="w-24" />
                </colgroup>
                <thead>
                  <tr className="border-y bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-2 font-medium">Opportunity</th>
                    <th className="px-3 py-2 font-medium">Fit</th>
                    <th className="px-3 py-2 font-medium">Eligibility</th>
                    <th className="px-5 py-2 text-right font-medium">Closes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {a.topMatches.map((m) => (
                    <tr key={m.id} className="group">
                      <td className="max-w-0 px-5 py-2.5">
                        <Link href={`/procurement/opportunities/${m.id}`} className="block truncate font-medium group-hover:underline">
                          {m.title}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {SOURCE_LABELS[m.source]} · {m.organization ?? "Unknown issuer"}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <FitBar score={m.fitScore} />
                      </td>
                      <td className="px-3 py-2.5">
                        <EligibilityBadge value={m.eligibility} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right text-xs tabular-nums text-muted-foreground">{m.deadline ? relativeDays(m.deadline) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Assess opportunities to see your best matches here.</p>
          )}
        </Panel>

        <Panel title="Closing in the next 14 days" subtitle="Active opportunities only" className="lg:col-span-5" icon={Hourglass} tone="from-rose-500 to-pink-600">
          {o.upcoming.length ? (
            <ul className="-my-1 space-y-1">
              {o.upcoming.map((u) => {
                // Same rounding as relativeDays() in the tables, so both agree.
                const days = Math.max(0, Math.round((new Date(u.deadline!).getTime() - Date.now()) / 86400_000));
                const urgent = days <= 3;
                return (
                  <li key={u.id}>
                    <Link href={`/procurement/opportunities/${u.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/50">
                      <div
                        className={cn(
                          "flex size-11 shrink-0 flex-col items-center justify-center rounded-xl border text-center",
                          urgent && "border-[var(--viz-critical)]/40 bg-[var(--viz-critical)]/[0.06]",
                        )}
                      >
                        <span className="text-sm font-semibold leading-none tabular-nums">{days === 0 ? "<1" : days}</span>
                        <span className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{days <= 1 ? "day" : "days"}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{u.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {urgent && <AlertTriangle className="mr-1 inline size-3 text-[var(--viz-critical)]" aria-label="Urgent" />}
                          {formatDate(u.deadline, true)} · {u.organization ?? "Unknown issuer"}
                        </p>
                      </div>
                      <FitBar score={u.fitScore} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <CalendarClock className="size-5 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Nothing active closes in the next two weeks.</p>
            </div>
          )}
        </Panel>
      </div>

      {/* Activity + attention/sources */}
      <div className="grid gap-5 lg:grid-cols-12">
        <Panel
          title="Live activity"
          subtitle="People, agents and the scheduler · refreshes every 20 seconds"
          className="lg:col-span-7"
          icon={Activity}
          tone="from-violet-500 to-indigo-600"
          action={
            <Link href="/procurement/activity" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              Full log <ArrowRight className="size-3" />
            </Link>
          }
        >
          {a.activity.length ? (
            <ol className="relative space-y-3.5 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border">
              {a.activity.map((l) => {
                const I = l.action === "opportunity.approval" ? Lock : ACTOR_ICON[l.actor];
                return (
                  <li
                    key={l.id}
                    className={cn(
                      "relative -mx-2 flex gap-3 rounded-xl px-2 py-1 text-sm transition-colors duration-1000",
                      freshIds.has(l.id) && "animate-in fade-in slide-in-from-top-2 bg-violet-500/10",
                    )}
                  >
                    <span className={cn("relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-sm", ACTOR_TONE[l.actor])}>
                      <I className="size-3.5" />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="line-clamp-2">
                        {freshIds.has(l.id) && <span className="mr-1.5 rounded bg-violet-600 px-1 py-px text-[10px] font-semibold uppercase text-white">New</span>}
                        {l.summary}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {l.actor === "ai" ? "AI agent" : l.actor === "system" ? "Scheduler" : "Team member"} · <span title={formatDate(l.createdAt, true)}>{ago(l.createdAt, now)}</span>
                        {l.opportunity && (
                          <>
                            {" · "}
                            <Link href={`/procurement/opportunities/${l.opportunity.id}`} className="hover:underline">
                              {l.opportunity.title}
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p>
          )}
        </Panel>

        <div className="space-y-5 lg:col-span-5">
          <Panel title="Needs attention" icon={Bell} tone="from-amber-400 to-orange-500">
            {o.alerts.length ? (
              <ul className="space-y-2.5">
                {o.alerts.slice(0, 6).map((al, i) => {
                  const Icon = al.level === "critical" ? ShieldAlert : al.level === "warning" ? AlertTriangle : Info;
                  return (
                    <li key={i} className="flex gap-2.5 text-sm">
                      <Icon
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          al.level === "critical" ? "text-[var(--viz-critical)]" : al.level === "warning" ? "text-amber-500" : "text-muted-foreground",
                        )}
                        aria-label={al.level}
                      />
                      {al.href ? (
                        <Link href={al.href} className="hover:underline">
                          {al.message}
                        </Link>
                      ) : (
                        <span>{al.message}</span>
                      )}
                    </li>
                  );
                })}
                {o.alerts.length > 6 && <li className="pl-6 text-xs text-muted-foreground">and {o.alerts.length - 6} more</li>}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing needs attention.</p>
            )}
          </Panel>

          <Panel
            title="Sources"
            subtitle="Where opportunities were found"
            icon={Globe2}
            tone="from-cyan-500 to-sky-600"
            action={
              <Link href="/procurement/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                Settings <ArrowRight className="size-3" />
              </Link>
            }
          >
            <SegmentedBar segments={sourceSegments} thin />
            {o.lastRuns.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t pt-3 text-xs">
                {o.lastRuns.slice(0, 3).map((run) => (
                  <li key={run.id} className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{run.source === "sam_gov" ? "SAM.gov" : "CanadaBuys"}</span>
                    <span className={cn("truncate text-right", run.error ? "text-[var(--viz-critical)]" : "text-muted-foreground")}>
                      {run.error ? run.error : `${run.scanned.toLocaleString()} scanned · ${run.created} new · ${formatDate(run.startedAt)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

