"use client";
import Link from "next/link";
import { Bot, Cog, Loader2, Lock, User } from "lucide-react";
import { api } from "@/trpc/react";
import { EmptyState, PageHeader, formatDate } from "../components/bits";

const ICON = { user: User, ai: Bot, system: Cog };
const WHO = { user: "Team member", ai: "AI agent", system: "Scheduler" };

export default function ActivityPage() {
  const { data, isLoading } = api.procurement.activity.useQuery({ limit: 300 });
  return (
    <>
      <PageHeader title="Activity log" description="A permanent record of what people approved and changed, and what the agents and scheduler did." />
      {isLoading ? (
        <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />
      ) : !data?.length ? (
        <EmptyState title="Nothing recorded yet" />
      ) : (
        <ol className="divide-y rounded-xl border bg-card">
          {data.map((l) => {
            const I = l.action === "opportunity.approval" ? Lock : ICON[l.actor];
            return (
              <li key={l.id} className="flex gap-3 px-4 py-3 text-sm">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  <I className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p>{l.summary}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {l.userName ?? WHO[l.actor]}
                    {l.actor === "ai" && l.userName ? " (AI agent)" : ""} · {formatDate(l.createdAt, true)}
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
