"use client";
import React from "react";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./components/bits";
import { DashboardView } from "./components/dashboard-view";

export default function ProcurementDashboard() {
  const utils = api.useUtils();
  const overview = api.procurement.overview.useQuery();
  const analytics = api.procurement.analytics.useQuery();
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

  if (overview.isLoading || analytics.isLoading) return <DashboardSkeleton />;
  const o = overview.data;
  const a = analytics.data;
  if (!o || !a) return <EmptyState title="Couldn't load the dashboard">{overview.error?.message ?? analytics.error?.message}</EmptyState>;

  return <DashboardView o={o} a={a} onFind={() => discover.mutate()} finding={discover.isPending} />;
}

function DashboardSkeleton() {
  const block = "animate-pulse rounded-2xl border bg-muted/40";
  return (
    <div className="space-y-5" aria-busy>
      <div className="h-16 w-72 animate-pulse rounded-xl bg-muted/50" />
      <div className="grid gap-5 lg:grid-cols-12">
        <div className={cn(block, "h-72 lg:col-span-8")} />
        <div className={cn(block, "h-72 lg:col-span-4")} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cn(block, "h-28")} />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className={cn(block, "h-64 lg:col-span-7")} />
        <div className={cn(block, "h-64 lg:col-span-5")} />
      </div>
    </div>
  );
}
