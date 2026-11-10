import React from "react";
import {
  format,
  isThisYear,
  isToday,
  isYesterday,
  formatDistanceToNowStrict,
} from "date-fns";
import {
  AlarmClock,
  Archive,
  ArchiveRestore,
  Check,
  Inbox,
  Loader2,
  Paperclip,
  Trash2,
  Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useThread } from "@/app/mail/use-thread";
import useVim from "./kbar/use-vim";
import useThreads, { type ThreadListItem } from "../use-threads";
import { useThreadActions } from "../use-thread-actions";
import { SenderAvatar } from "./sender-avatar";

function dayLabel(date: Date) {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, isThisYear(date) ? "EEEE, MMM d" : "MMM d, yyyy");
}

function shortTime(date: Date) {
  if (isToday(date)) return format(date, "h:mm a");
  if (isThisYear(date)) return format(date, "MMM d");
  return format(date, "M/d/yy");
}

/** Strip any markup from snippets — the list renders plain text only. */
function plain(snippet?: string | null) {
  return (snippet ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export function ThreadList() {
  const {
    threads,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    done,
    tab,
    mode,
  } = useThreads();
  const [threadId, setThreadId] = useThread();
  const { selectedThreadIds, visualMode } = useVim();
  const actions = useThreadActions();

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const groups = React.useMemo(() => {
    const out: { key: string; label: string; items: ThreadListItem[] }[] = [];
    for (const t of threads) {
      const d = new Date(t.lastMessageDate);
      const key = format(d, "yyyy-MM-dd");
      const last = out.at(-1);
      if (last?.key === key) last.items.push(t);
      else out.push({ key, label: dayLabel(d), items: [t] });
    }
    return out;
  }, [threads]);

  if (isLoading) return <ThreadListSkeleton />;

  if (threads.length === 0) {
    return (
      <div className="flex h-[calc(100vh-140px)] flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          {mode === "done" ? (
            <Check className="size-5" />
          ) : mode === "snoozed" ? (
            <AlarmClock className="size-5" />
          ) : mode === "trash" ? (
            <Trash2 className="size-5" />
          ) : (
            <Inbox className="size-5" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium">
            {mode === "done"
              ? "Nothing archived yet"
              : mode === "snoozed"
                ? "No snoozed threads"
                : mode === "trash"
                  ? "Trash is empty"
                  : tab === "inbox"
                    ? "You're all caught up"
                    : `No ${tab} yet`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === "done"
              ? "Press E on a thread to archive it."
              : mode === "snoozed"
                ? "Press H on a thread to snooze it until later."
                : mode === "trash"
                  ? "Threads you delete land here."
                  : "New mail will show up here automatically."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-140px)] overflow-y-auto">
      <div className="pb-6">
        {groups.map((group) => (
          <section key={group.key}>
            <div className="sticky top-0 z-10 bg-background/85 px-4 pb-1.5 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 backdrop-blur">
              {group.label}
            </div>
            <ul className="px-2">
              {group.items.map((item) => {
                const last = item.emails[0];
                const isSelected = threadId === item.id;
                const isMarked =
                  visualMode && selectedThreadIds.includes(item.id);
                const unread = last?.status === "unread" && mode === "active";
                const snoozedUntil = item.snoozedUntil
                  ? new Date(item.snoozedUntil)
                  : null;
                const sentAt = new Date(last?.sentAt ?? item.lastMessageDate);
                const sender =
                  last?.from?.name || last?.from?.address || "Unknown";
                const count = item._count.emails;

                return (
                  <li key={item.id}>
                    <div
                      id={`thread-${item.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setThreadId(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setThreadId(item.id);
                      }}
                      aria-selected={isSelected}
                      className={cn(
                        "group/row relative flex cursor-pointer gap-3 rounded-xl px-3 py-2.5 outline-none transition-colors",
                        "hover:bg-foreground/[0.035] focus-visible:ring-2 focus-visible:ring-ring",
                        isSelected &&
                          "bg-brand-soft hover:bg-brand-soft dark:bg-brand-soft",
                        isMarked && "bg-brand/15 hover:bg-brand/15",
                      )}
                    >
                      {isSelected && (
                        <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-brand" />
                      )}
                      <SenderAvatar
                        name={sender}
                        email={last?.from?.address}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {unread && (
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-brand"
                              aria-label="Unread"
                            />
                          )}
                          <span
                            className={cn(
                              "truncate text-[13px]",
                              unread
                                ? "font-semibold text-foreground"
                                : "font-medium text-foreground/90",
                            )}
                          >
                            {sender}
                          </span>
                          {count > 1 && (
                            <span className="shrink-0 rounded-md bg-muted px-1 text-[10px] font-medium tabular-nums text-muted-foreground">
                              {count}
                            </span>
                          )}
                          <span
                            className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground group-hover/row:opacity-0"
                            title={`${format(sentAt, "PPpp")} · ${formatDistanceToNowStrict(sentAt, { addSuffix: true })}`}
                          >
                            {mode === "snoozed" && snoozedUntil ? (
                              <span className="inline-flex items-center gap-1 text-brand">
                                <AlarmClock className="size-3" />
                                {shortTime(snoozedUntil)}
                              </span>
                            ) : (
                              shortTime(sentAt)
                            )}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <p
                            className={cn(
                              "truncate text-[13px]",
                              unread
                                ? "font-medium text-foreground"
                                : "text-foreground/80",
                            )}
                          >
                            {item.subject || "(no subject)"}
                          </p>
                          {last?.hasAttachments && (
                            <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {plain(last?.bodySnippet)}
                        </p>
                      </div>

                      {/* Hover quick actions */}
                      <div className="absolute right-2.5 top-2 hidden items-center gap-0.5 rounded-lg border bg-background p-0.5 shadow-sm group-hover/row:flex">
                        {mode === "active" && (
                          <RowAction
                            label="Archive (E)"
                            onClick={() => void actions.archive([item.id])}
                          >
                            <Archive className="size-3.5" />
                          </RowAction>
                        )}
                        {mode === "done" && (
                          <RowAction
                            label="Move to inbox (U)"
                            onClick={() => void actions.unarchive([item.id])}
                          >
                            <Undo2 className="size-3.5" />
                          </RowAction>
                        )}
                        {mode === "snoozed" && (
                          <RowAction
                            label="Unsnooze"
                            onClick={() => void actions.unsnooze([item.id])}
                          >
                            <Inbox className="size-3.5" />
                          </RowAction>
                        )}
                        {mode === "trash" ? (
                          <RowAction
                            label="Restore"
                            onClick={() => void actions.restore([item.id])}
                          >
                            <ArchiveRestore className="size-3.5" />
                          </RowAction>
                        ) : (
                          <RowAction
                            label="Delete (#)"
                            onClick={() => void actions.trash([item.id])}
                            destructive
                          >
                            <Trash2 className="size-3.5" />
                          </RowAction>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <div ref={sentinelRef} className="flex h-12 items-center justify-center">
          {isFetchingNextPage && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
          {!hasNextPage && threads.length > 10 && (
            <span className="text-[11px] text-muted-foreground/60">
              That's everything
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function RowAction({
  label,
  onClick,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.05]",
        destructive ? "hover:text-destructive" : "hover:text-foreground",
      )}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function ThreadListSkeleton() {
  return (
    <div className="space-y-1 px-2 pt-3" aria-busy="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-xl px-3 py-2.5">
          <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2 py-0.5">
            <div className="flex justify-between">
              <div className="h-3 w-28 animate-pulse rounded bg-muted" />
              <div className="h-3 w-10 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted/70" />
          </div>
        </div>
      ))}
    </div>
  );
}
