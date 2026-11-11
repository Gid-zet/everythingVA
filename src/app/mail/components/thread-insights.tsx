"use client";

import React from "react";
import { CheckCircle2, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { api, type RouterOutputs } from "@/trpc/react";
import { cn } from "@/lib/utils";

type Insight = RouterOutputs["mail"]["summarizeThread"];

const PRIORITY: Record<Insight["priority"], string> = {
  urgent: "bg-red-500/10 text-red-600 dark:text-red-400",
  high: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  medium: "bg-foreground/[0.06] text-foreground/70",
  low: "bg-foreground/[0.04] text-muted-foreground",
};

/** AI summary, priority, action items and reply suggestions for a thread (cached server-side). */
export function ThreadInsights({ accountId, threadId }: { accountId: string; threadId: string }) {
  const [insight, setInsight] = React.useState<Insight | null>(null);
  const summarize = api.mail.summarizeThread.useMutation({ onSuccess: setInsight });
  const [copied, setCopied] = React.useState<number | null>(null);

  React.useEffect(() => {
    setInsight(null);
  }, [threadId]);

  if (!insight) {
    return (
      <button
        type="button"
        onClick={() => summarize.mutate({ accountId, threadId })}
        disabled={summarize.isPending}
        className="inline-flex items-center gap-1.5 rounded-lg border bg-sidebar px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-70"
      >
        {summarize.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-brand" />}
        {summarize.isPending ? "Summarizing…" : "Summarize with AI"}
        {summarize.error && <span className="ml-2 text-destructive">{summarize.error.message}</span>}
      </button>
    );
  }

  return (
    <section className="rounded-xl border bg-sidebar p-4" aria-label="AI summary">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-brand" />
        <h3 className="text-[13px] font-semibold">Summary</h3>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", PRIORITY[insight.priority])}>
          {insight.priority} priority
        </span>
        {insight.needsReply && (
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">Needs your reply</span>
        )}
        <button
          type="button"
          onClick={() => summarize.mutate({ accountId, threadId, refresh: true })}
          className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Regenerate summary"
          disabled={summarize.isPending}
        >
          <RefreshCw className={cn("size-3.5", summarize.isPending && "animate-spin")} />
        </button>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-foreground/90">{insight.summary}</p>
      {insight.actionItems.length > 0 && (
        <ul className="mt-3 space-y-1">
          {insight.actionItems.map((item) => (
            <li key={item} className="flex gap-2 text-[13px]">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
      )}
      {insight.suggestedReplies.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {insight.suggestedReplies.map((r, i) => (
            <button
              key={r}
              type="button"
              title="Copy to clipboard"
              onClick={() => {
                void navigator.clipboard.writeText(r);
                setCopied(i);
                setTimeout(() => setCopied(null), 1500);
              }}
              className="max-w-full truncate rounded-full border bg-background px-3 py-1 text-[12px] hover:border-brand/40"
            >
              {copied === i ? "Copied" : r}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
