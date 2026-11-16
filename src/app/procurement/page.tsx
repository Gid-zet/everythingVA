"use client";
import React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Info, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { EmptyState, FitScore, PageHeader, Section, StatusBadge, formatDate, money, relativeDays } from "./components/bits";

export default function ProcurementDashboard() {
  const utils = api.useUtils();
  const { data, isLoading, error } = api.procurement.overview.useQuery();
  const discover = api.procurement.runDiscovery.useMutation({
    onSuccess: (results) => {
      const created = results.reduce((n, r) => n + r.created, 0);
      const failed = results.filter((r) => r.error);
      if (failed.length) toast.error(failed.map((f) => f.error).join(" "));
      toast.success(`Discovery finished: ${created} new ${created === 1 ? "opportunity" : "opportunities"}.`);
      void utils.procurement.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <Loader2 className="mx-auto mt-20 size-5 animate-spin text-muted-foreground" />;
  if (error || !data) return <EmptyState title="Couldn't load the dashboard">{error?.message}</EmptyState>;

  const s = data.stats;
  const canRun = data.hasProfile && data.workspace.role !== "viewer";
  const cards: { label: string; value: number; href: string; note?: string }[] = [
    { label: "Opportunities found", value: s.total, href: "/procurement/opportunities?status=all" },
    {
      label: "Qualified or potentially qualified",
      value: s.qualified,
      href: "/procurement/opportunities?eligibility=eligible",
      note: s.needsClarification ? `${s.needsClarification} more need clarification` : undefined,
    },
    { label: "Awaiting review", value: s.awaitingReview, href: "/procurement/opportunities" },
    { label: "Being prepared", value: s.inProposal, href: "/procurement/opportunities?status=proposal_in_progress" },
    { label: "Submitted", value: s.submitted, href: "/procurement/opportunities?status=submitted" },
    { label: "Awarded", value: s.awarded, href: "/procurement/opportunities?status=awarded" },
  ];

  return (
    <>
      <PageHeader
        title="Procurement dashboard"
        description="Opportunities found for your business, where each one stands, and what needs attention."
        actions={
          <Button onClick={() => discover.mutate()} disabled={!canRun || discover.isPending}>
            {discover.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
            {discover.isPending ? "Searching sources…" : "Find opportunities now"}
          </Button>
        }
      />

      {!data.hasProfile && (
        <div className="mb-6 rounded-xl border border-brand/30 bg-brand-soft p-5">
          <p className="text-sm font-semibold">Start with your company profile</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Discovery and qualification use your services, keywords, industry codes and verified certifications. Nothing is searched until the profile exists.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link href="/procurement/profile">Set up the profile</Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="group rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums">{c.value.toLocaleString()}</p>
            {c.note && <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">{c.note}</p>}
          </Link>
        ))}
      </div>

      <div className="mt-3 rounded-xl border bg-card p-4">
        <p className="text-xs text-muted-foreground">Estimated pipeline value</p>
        <p className="mt-1.5 text-2xl font-semibold tabular-nums">{s.pipelineValueCount ? money(s.pipelineValue) : "–"}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {s.pipelineValueCount
            ? `Sum of the ${s.pipelineValueCount} active ${s.pipelineValueCount === 1 ? "opportunity" : "opportunities"} with a known value (currencies are not converted).`
            : "Most notices don't publish a value. Add one on an opportunity to include it here."}
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Section title="Deadlines in the next 14 days" className="lg:col-span-3">
          {data.upcoming.length ? (
            <ul className="-my-2 divide-y">
              {data.upcoming.map((o) => (
                <li key={o.id}>
                  <Link href={`/procurement/opportunities/${o.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{o.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {o.organization ?? "Unknown issuer"} · closes {formatDate(o.deadline, true)} ({relativeDays(o.deadline)})
                      </p>
                    </div>
                    <FitScore score={o.fitScore} />
                    <StatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No active opportunities close in the next two weeks.</p>
          )}
        </Section>

        <Section title="Needs attention" className="lg:col-span-2">
          {data.alerts.length ? (
            <ul className="space-y-2.5">
              {data.alerts.slice(0, 10).map((a, i) => {
                const Icon = a.level === "critical" ? ShieldAlert : a.level === "warning" ? AlertTriangle : Info;
                return (
                  <li key={i} className="flex gap-2.5 text-sm">
                    <Icon
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        a.level === "critical" ? "text-rose-500" : a.level === "warning" ? "text-amber-500" : "text-muted-foreground",
                      )}
                    />
                    {a.href ? (
                      <Link href={a.href} className="hover:underline">
                        {a.message}
                      </Link>
                    ) : (
                      <span>{a.message}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing needs attention.</p>
          )}
        </Section>
      </div>

      <Section
        title="Recent discovery runs"
        className="mt-6"
        actions={
          <Link href="/procurement/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Sources <ArrowRight className="size-3" />
          </Link>
        }
      >
        {data.lastRuns.length ? (
          <ul className="-my-1 space-y-1.5 text-sm">
            {data.lastRuns.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{r.source === "sam_gov" ? "SAM.gov" : "CanadaBuys"}</span>
                <span className="text-xs text-muted-foreground">{formatDate(r.startedAt, true)}</span>
                {r.error ? (
                  <span className="text-xs text-rose-600 dark:text-rose-400">{r.error}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {r.scanned.toLocaleString()} scanned · {r.created} new · {r.updated} updated
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No searches yet. Discovery runs every day at 11:00 UTC once it's deployed, or press “Find opportunities now”.
          </p>
        )}
        {!data.aiConfigured && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">AI isn't configured, so opportunities won't be qualified automatically.</p>
        )}
      </Section>
    </>
  );
}
