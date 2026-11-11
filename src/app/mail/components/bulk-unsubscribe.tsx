"use client";
import { useSingleAccount, SingleAccountPicker } from "@/app/mail/use-single-account";

import React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Archive,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MailMinus,
  Search,
  Zap,
} from "lucide-react";
import { useLocalStorage } from "usehooks-ts";
import { toast } from "sonner";

import { api, type RouterOutputs } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SenderAvatar } from "./sender-avatar";

type Sender = RouterOutputs["mail"]["getSenders"]["senders"][number];
type Filter = "all" | "subscribed" | "unsubscribed";

const PAGE = 30;

/**
 * Bulk unsubscribe (after Inbox Zero's): senders ranked by volume, with
 * one-click unsubscribe via List-Unsubscribe and "archive all from sender".
 */
export function BulkUnsubscribe() {
  const { accountId } = useSingleAccount();
  const utils = api.useUtils();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState<Record<string, "unsub" | "archive">>({});

  const input = { accountId, limit: PAGE };
  const senders = api.mail.getSenders.useInfiniteQuery(input, {
    enabled: !!accountId,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
  });

  const unsubscribe = api.mail.unsubscribeSender.useMutation();
  const markUnsubscribed = api.mail.markSenderUnsubscribed.useMutation();
  const archiveAll = api.mail.archiveAllFromSender.useMutation();
  const unarchive = api.mail.unarchiveThreads.useMutation();

  const all = React.useMemo(
    () => senders.data?.pages.flatMap((p) => p.senders) ?? [],
    [senders.data],
  );
  const max = all[0]?.emailCount ?? 1;

  const visible = all.filter((s) => {
    if (filter === "subscribed" && s.unsubscribedAt) return false;
    if (filter === "unsubscribed" && !s.unsubscribedAt) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (s.name ?? "").toLowerCase().includes(q) || s.address.toLowerCase().includes(q);
  });

  /** Patch one sender in the cached pages; returns the previous data for rollback. */
  const patch = (fromId: string, fn: (s: Sender) => Sender) => {
    const previous = utils.mail.getSenders.getInfiniteData(input);
    utils.mail.getSenders.setInfiniteData(input, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((p) => ({
              ...p,
              senders: p.senders.map((s) => (s.fromId === fromId ? fn(s) : s)),
            })),
          }
        : data,
    );
    return previous;
  };

  const setBusyFor = (fromId: string, kind?: "unsub" | "archive") =>
    setBusy((b) => {
      const next = { ...b };
      if (kind) next[fromId] = kind;
      else delete next[fromId];
      return next;
    });

  const onUnsubscribe = async (s: Sender) => {
    setBusyFor(s.fromId, "unsub");
    const previous = patch(s.fromId, (x) => ({ ...x, unsubscribedAt: new Date() }));
    try {
      const res = await unsubscribe.mutateAsync({ accountId, fromId: s.fromId });
      if (res.method === "link") {
        // Needs the user on the sender's page; don't claim success yet.
        utils.mail.getSenders.setInfiniteData(input, previous);
        toast(`Finish unsubscribing from ${s.name || s.address}`, {
          description: "This sender needs you to confirm on their website.",
          duration: 15_000,
          action: {
            label: "Open page",
            onClick: () => {
              window.open(res.url, "_blank", "noopener,noreferrer");
              patch(s.fromId, (x) => ({ ...x, unsubscribedAt: new Date() }));
              void markUnsubscribed
                .mutateAsync({ accountId, fromId: s.fromId, unsubscribed: true })
                .catch(() => undefined);
            },
          },
        });
      } else {
        toast.success(`Unsubscribed from ${s.name || s.address}`, {
          description:
            res.method === "one-click"
              ? "Sent a one-click unsubscribe request."
              : "Sent an unsubscribe email from your mailbox.",
          action:
            s.inboxCount > 0
              ? { label: `Archive ${s.inboxCount}`, onClick: () => void onArchiveAll(s) }
              : undefined,
        });
      }
    } catch (error) {
      utils.mail.getSenders.setInfiniteData(input, previous);
      toast.error(error instanceof Error ? error.message : "Couldn't unsubscribe");
    } finally {
      setBusyFor(s.fromId);
    }
  };

  const onArchiveAll = async (s: Sender) => {
    setBusyFor(s.fromId, "archive");
    const previous = patch(s.fromId, (x) => ({ ...x, inboxCount: 0 }));
    try {
      const res = await archiveAll.mutateAsync({ accountId, fromId: s.fromId });
      const n = res.threadIds.length;
      toast.success(
        n ? `Archived ${n} thread${n === 1 ? "" : "s"} from ${s.name || s.address}` : "Nothing left in your inbox from this sender",
        {
          description: res.failed ? `${res.failed} message${res.failed === 1 ? "" : "s"} couldn't be updated in your mailbox.` : undefined,
          action: n
            ? {
                label: "Undo",
                onClick: () => {
                  patch(s.fromId, (x) => ({ ...x, inboxCount: s.inboxCount }));
                  void unarchive
                    .mutateAsync({ accountId, threadIds: res.threadIds })
                    .catch(() => toast.error("Couldn't undo. Try moving them back from Archived."))
                    .finally(() => void utils.mail.getThreads.invalidate());
                },
              }
            : undefined,
        },
      );
    } catch (error) {
      utils.mail.getSenders.setInfiniteData(input, previous);
      toast.error(error instanceof Error ? error.message : "Couldn't archive");
    } finally {
      setBusyFor(s.fromId);
      void utils.mail.getThreads.invalidate();
      void utils.mail.getThreadCounts.invalidate();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b px-4">
        <h1 className="text-[15px] font-semibold tracking-tight">Unsubscribe</h1>
        <span className="text-xs text-muted-foreground">Senders ranked by volume</span>
        <SingleAccountPicker label="" className="ml-auto max-w-[260px]" />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter senders"
            className="h-8 w-full rounded-lg border bg-background pl-8 pr-2 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex rounded-lg bg-muted p-0.5">
          {(["all", "subscribed", "unsubscribed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-medium capitalize transition-colors",
                filter === f
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {senders.isLoading ? (
          <SenderSkeleton />
        ) : visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <MailMinus className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {all.length ? "No senders match" : "No senders yet"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {all.length
                  ? "Try a different filter."
                  : "Once your mail syncs, the noisiest senders show up here."}
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y">
            {visible.map((s) => (
              <SenderRow
                key={s.fromId}
                sender={s}
                share={s.emailCount / max}
                busy={busy[s.fromId]}
                onUnsubscribe={() => void onUnsubscribe(s)}
                onArchiveAll={() => void onArchiveAll(s)}
              />
            ))}
          </ul>
        )}
        {senders.hasNextPage && (
          <div className="flex justify-center py-4">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              disabled={senders.isFetchingNextPage}
              onClick={() => void senders.fetchNextPage()}
            >
              {senders.isFetchingNextPage && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Load more senders
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SenderRow({
  sender: s,
  share,
  busy,
  onUnsubscribe,
  onArchiveAll,
}: {
  sender: Sender;
  share: number;
  busy?: "unsub" | "archive";
  onUnsubscribe: () => void;
  onArchiveAll: () => void;
}) {
  const display = s.name || s.address;
  const canUnsub = !!s.unsubscribe;

  return (
    <li className="group/row flex items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.025]">
      <SenderAvatar name={display} email={s.address} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium">{display}</span>
          {s.unsubscribedAt && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-3" />
              Unsubscribed
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {s.name ? s.address : (s.lastSubject ?? "")}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 w-24 overflow-hidden rounded-full bg-muted sm:w-32">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${Math.max(4, share * 100)}%` }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {s.emailCount} email{s.emailCount === 1 ? "" : "s"}
            {s.inboxCount > 0 && ` · ${s.inboxCount} in inbox`}
            {s.lastSentAt &&
              ` · ${formatDistanceToNowStrict(new Date(s.lastSentAt), { addSuffix: true })}`}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs"
                disabled={!!busy || s.inboxCount === 0}
                onClick={onArchiveAll}
              >
                {busy === "archive" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Archive className="size-3.5" />
                )}
                <span className="hidden sm:inline">Archive all</span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {s.inboxCount
              ? `Archive ${s.inboxCount} inbox thread${s.inboxCount === 1 ? "" : "s"}`
              : "Nothing from this sender in your inbox"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                size="sm"
                className={cn(
                  "h-8 gap-1.5 px-2.5 text-xs",
                  s.unsubscribedAt
                    ? "bg-muted text-muted-foreground hover:bg-muted"
                    : "bg-brand text-brand-foreground hover:bg-brand/90",
                )}
                disabled={!!busy || !canUnsub || !!s.unsubscribedAt}
                onClick={onUnsubscribe}
              >
                {busy === "unsub" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : s.unsubscribe?.oneClick ? (
                  <Zap className="size-3.5" />
                ) : s.unsubscribe?.hasMailto ? (
                  <MailMinus className="size-3.5" />
                ) : (
                  <ExternalLink className="size-3.5" />
                )}
                {s.unsubscribedAt ? "Done" : "Unsubscribe"}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {!canUnsub
              ? "This sender doesn't include an unsubscribe link"
              : s.unsubscribedAt
                ? "Already unsubscribed"
                : s.unsubscribe?.oneClick
                  ? "One-click unsubscribe"
                  : s.unsubscribe?.hasMailto
                    ? "Sends an unsubscribe email from your account"
                    : "Opens the sender's unsubscribe page"}
          </TooltipContent>
        </Tooltip>
      </div>
    </li>
  );
}

function SenderSkeleton() {
  return (
    <div className="divide-y" aria-busy="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-56 animate-pulse rounded bg-muted/70" />
          </div>
          <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
        </div>
      ))}
    </div>
  );
}
