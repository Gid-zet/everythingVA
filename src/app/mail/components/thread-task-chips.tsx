"use client";
import React from "react";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { formatDue, priorityMeta } from "@/app/tasks/components/bits";
import { localToday } from "@/app/tasks/components/store";

/** Tasks linked to this thread, shown as chips under the subject. */
export function ThreadTaskChips({ threadId }: { threadId: string }) {
  const { data } = api.tasks.forThread.useQuery({ threadId }, { staleTime: 30_000 });
  if (!data?.length) return null;
  const today = localToday();
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {data.map((t) => (
        <Link
          key={t.id}
          href={`/tasks?view=all&task=${t.id}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-xs transition-colors hover:border-foreground/25"
        >
          {t.status === "done" ? <CheckCircle2 className="size-3 text-emerald-600" /> : <Circle className="size-3" style={{ color: priorityMeta(t.priority).color }} />}
          <span className={cn("truncate", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</span>
          {t.dueDate && t.status !== "done" && <span className="text-muted-foreground">{formatDue(t.dueDate, today)}</span>}
        </Link>
      ))}
    </div>
  );
}

