"use client";
import React from "react";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { localDateTime } from "@/components/add-as-task";
import { EmptyState } from "./components/bits";
import { DashboardView } from "./components/dashboard-view";

/** How often the dashboard refreshes while it's open (paused in background tabs). */
const LIVE_MS = 20_000;

export default function ProcurementDashboard() {
  const utils = api.useUtils();
  const live = { refetchInterval: LIVE_MS, refetchIntervalInBackground: false, refetchOnWindowFocus: true } as const;
  const overview = api.procurement.overview.useQuery(undefined, live);
  const analytics = api.procurement.analytics.useQuery(undefined, live);
  const unscored = api.procurement.opportunities.useQuery({ status: "active", eligibility: "unscored", sort: "relevance", limit: 5 }, live);
  const top = analytics.data?.topMatches[0];
  const topTasks = api.tasks.forOpportunity.useQuery({ opportunityId: top?.id ?? "" }, { enabled: !!top, staleTime: 15_000 });

  const discover = api.procurement.runDiscovery.useMutation({
    onSuccess: (results) => {
      const failed = results.filter((r) => r.error);
      for (const f of failed) toast.error(f.error);
      const created = results.reduce((n, r) => n + r.created, 0);
      if (failed.length < results.length) toast.success(`Discovery finished: ${created} new ${created === 1 ? "opportunity" : "opportunities"}.`);
      void utils.procurement.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // "Assess with AI": run the qualification agent on the top unassessed, one at a time.
  const qualify = api.procurement.qualify.useMutation();
  const [assess, setAssess] = React.useState<{ done: number; total: number } | null>(null);
  const runAssess = async () => {
    const ids = (unscored.data ?? []).map((o) => o.id);
    if (!ids.length) return;
    setAssess({ done: 0, total: ids.length });
    let ok = 0;
    for (const [i, id] of ids.entries()) {
      try {
        await qualify.mutateAsync({ id });
        ok++;
      } catch (e) {
        toast.error((e as Error).message);
      }
      setAssess({ done: i + 1, total: ids.length });
      void utils.procurement.analytics.invalidate();
    }
    setAssess(null);
    void utils.procurement.invalidate();
    if (ok) toast.success(`Assessed ${ok} ${ok === 1 ? "opportunity" : "opportunities"}`);
  };

  const createTask = api.tasks.create.useMutation({
    onSuccess: (t) => {
      void utils.tasks.invalidate();
      toast.success("Best match added to your tasks", {
        action: { label: "Open", onClick: () => (window.location.href = `/tasks?view=all&task=${t.id}`) },
      });
    },
    onError: (e) => toast.error(e.message),
  });

  if (overview.isLoading || analytics.isLoading) return <DashboardSkeleton />;
  const o = overview.data;
  const a = analytics.data;
  if (!o || !a) return <EmptyState title="Couldn't load the dashboard">{overview.error?.message ?? analytics.error?.message}</EmptyState>;

  const canRun = o.hasProfile && o.workspace.role !== "viewer";
  const r = a.readiness;
  const existingTask = topTasks.data?.[0];
  const missingDocs = o.alerts.filter((x) => x.message.startsWith("The knowledge base has no")).length;

  return (
    <DashboardView
      o={o}
      a={a}
      live={{ updatedAt: Math.max(overview.dataUpdatedAt, analytics.dataUpdatedAt), refreshing: overview.isFetching || analytics.isFetching }}
      agentStatus={assess ? `Qualification agent · ${assess.done}/${assess.total}` : discover.isPending ? "Discovery agent searching" : null}
      actions={{
        canRun,
        find: { run: () => discover.mutate(), running: discover.isPending },
        assess: {
          run: () => void runAssess(),
          running: !!assess,
          done: assess?.done ?? 0,
          total: assess?.total ?? 0,
          available: unscored.data?.length ?? 0,
          aiConfigured: o.aiConfigured,
        },
        addTop: {
          title: top?.title ?? null,
          inTasks: !!existingTask,
          taskId: existingTask?.id ?? null,
          running: createTask.isPending,
          run: () => {
            if (!top) return;
            const due = top.deadline ? localDateTime(new Date(top.deadline)) : null;
            createTask.mutate({
              title: `Bid: ${top.title}`.slice(0, 500),
              projectName: "Procurement",
              priority: top.fitScore !== null && top.fitScore >= 70 ? "high" : "medium",
              dueDate: due?.date ?? null,
              dueTime: due?.time ?? null,
              dueAt: top.deadline ? new Date(top.deadline) : null,
              opportunityId: top.id,
            });
          },
        },
        clarifications: a.eligibility.requires_clarification,
        unverified: r.credentials.total - r.credentials.valid,
        missingDocs,
      }}
    />
  );
}

function DashboardSkeleton() {
  const block = "animate-pulse rounded-2xl border bg-muted/40";
  return (
    <div className="space-y-5" aria-busy>
      <div className="h-44 animate-pulse rounded-3xl bg-gradient-to-r from-indigo-500/30 via-violet-500/30 to-sky-500/30" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn(block, "h-20")} />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className={cn(block, "h-72 lg:col-span-8")} />
        <div className={cn(block, "h-72 lg:col-span-4")} />
      </div>
    </div>
  );
}
