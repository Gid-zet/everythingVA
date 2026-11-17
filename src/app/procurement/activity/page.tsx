"use client";
import Link from "next/link";
import { Activity, Bot, Cog, Loader2, Lock, User } from "lucide-react";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { useNewIds, useNow } from "@/components/live";
import { EmptyState, PageHeader, formatDate } from "../components/bits";

const ICON = { user: User, ai: Bot, system: Cog };
const WHO = { user: "Team member", ai: "AI agent", system: "Scheduler" };
const TONE = { user: "from-emerald-500 to-teal-600", ai: "from-violet-500 to-fuchsia-600", system: "from-sky-500 to-blue-600" };

function ago(d: Date | string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(d).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return formatDate(d, true);
}

export default function ActivityPage() {
  const q = api.procurement.activity.useQuery({ limit: 300 }, { refetchInterval: 15_000, refetchIntervalInBackground: false });
  const data = q.data;
  const now = useNow(15_000);
  const fresh = useNewIds((data ?? []).map((l) => l.id));
  const today = new Date().toDateString();
  const todays = (data ?? []).filter((l) => new Date(l.createdAt).toDateString() === today);

  return (
    <>
      <PageHeader
        title="Activity log"
        description="A permanent record of what people approved and changed, and what the agents and scheduler did."
        tone="sunset"
        icon={Activity}
        live={q.dataUpdatedAt ? { updatedAt: q.dataUpdatedAt, refreshing: q.isFetching } : null}
        stats={[
          { label: "Today", value: todays.length },
          { label: "By AI today", value: todays.filter((l) => l.actor === "ai").length },
          { label: "Approvals", value: (data ?? []).filter((l) => l.action === "opportunity.approval").length },
        ]}
      />
      {q.isLoading ? (
        <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />
      ) : !data?.length ? (
        <EmptyState title="Nothing recorded yet" />
      ) : (
        <ol className="divide-y rounded-2xl border bg-card">
          {data.map((l) => {
            const I = l.action === "opportunity.approval" ? Lock : ICON[l.actor];
            return (
              <li key={l.id} className={cn("flex gap-3 px-4 py-3 text-sm transition-colors duration-1000", fresh.has(l.id) && "animate-in fade-in slide-in-from-top-2 bg-orange-500/10")}>
                <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-sm", TONE[l.actor])}>
                  <I className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p>
                    {fresh.has(l.id) && <span className="mr-1.5 rounded bg-orange-600 px-1 py-px text-[10px] font-semibold uppercase text-white">New</span>}
                    {l.summary}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {l.userName ?? WHO[l.actor]}
                    {l.actor === "ai" && l.userName ? " (AI agent)" : ""} · <span title={formatDate(l.createdAt, true)}>{ago(l.createdAt, now)}</span>
                    {l.opportunity && (
                      <>
                        {" · "}
                        <Link href={`/procurement/opportunities/${l.opportunity.id}`} className="hover:underline">
                          {l.opportunity.title.length > 70 ? `${l.opportunity.title.slice(0, 70)}…` : l.opportunity.title}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
