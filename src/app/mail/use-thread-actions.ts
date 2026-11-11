import { api, type RouterOutputs } from "@/trpc/react";
import type { InfiniteData } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { format, isToday, isTomorrow } from "date-fns";
import { toast } from "sonner";
import useThreads, { ALL_ACCOUNTS } from "./use-threads";
import { useThread } from "./use-thread";

type Page = RouterOutputs["mail"]["getThreads"];

export type ThreadActionKind =
  | "archive"
  | "unarchive"
  | "trash"
  | "restore"
  | "snooze"
  | "unsnooze"
  | "spam"
  | "notSpam";

const plural = (n: number) => (n > 1 ? `${n} threads` : "Thread");

function snoozeLabel(until: Date) {
  const time = format(until, "h:mm a");
  if (isToday(until)) return `today at ${time}`;
  if (isTomorrow(until)) return `tomorrow at ${time}`;
  return format(until, "EEE, MMM d 'at' h:mm a");
}

/**
 * Optimistic, provider-synced thread actions with an Undo toast (the pattern
 * from Zero's useOptimisticActions). The UI changes immediately, the server
 * call (DB + provider) runs in the background, and a failure rolls back.
 *
 * In the unified inbox, threads belong to different accounts, so each action
 * is split per account and sent to that account's provider.
 */
export function useThreadActions() {
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const { threads, queryKey, accountId } = useThreads();
  const [threadId, setThreadId] = useThread();

  const mutations = {
    archive: api.mail.archiveThreads.useMutation(),
    unarchive: api.mail.unarchiveThreads.useMutation(),
    trash: api.mail.trashThreads.useMutation(),
    restore: api.mail.restoreThreads.useMutation(),
    snooze: api.mail.snoozeThreads.useMutation(),
    unsnooze: api.mail.unsnoozeThreads.useMutation(),
    setSpam: api.mail.setSpam.useMutation(),
    setRead: api.mail.setRead.useMutation(),
    setStarred: api.mail.setStarred.useMutation(),
  };

  /** Group thread ids by the account that owns them. */
  const byAccount = (ids: string[]) => {
    const groups = new Map<string, string[]>();
    for (const id of ids) {
      const owner =
        accountId === ALL_ACCOUNTS ? threads.find((t) => t.id === id)?.accountId : accountId;
      if (!owner) continue;
      groups.set(owner, [...(groups.get(owner) ?? []), id]);
    }
    return [...groups.entries()];
  };

  const patchList = (fn: (t: Page["threads"][number]) => Page["threads"][number] | null) => {
    const previous = queryClient.getQueryData<InfiniteData<Page>>(queryKey);
    queryClient.setQueryData<InfiniteData<Page>>(queryKey, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((p) => ({
              ...p,
              threads: p.threads.map(fn).filter(Boolean) as Page["threads"],
            })),
          }
        : data,
    );
    return previous;
  };

  const removeFromList = (ids: string[]) => {
    const previous = patchList((t) => (ids.includes(t.id) ? null : t));
    // Move selection to the neighbour of the removed row.
    if (threadId && ids.includes(threadId)) {
      const idx = threads.findIndex((t) => t.id === threadId);
      const remaining = threads.filter((t) => !ids.includes(t.id));
      setThreadId(remaining[idx]?.id ?? remaining[idx - 1]?.id);
    }
    return previous;
  };

  const settle = () => {
    void utils.mail.getThreads.invalidate();
    void utils.mail.getThreadCounts.invalidate();
    void utils.mail.getThreadById.invalidate();
  };

  const messages: Record<ThreadActionKind, (n: number, until?: Date) => string> = {
    archive: (n) => `${plural(n)} archived`,
    unarchive: (n) => `${plural(n)} moved to inbox`,
    trash: (n) => `${plural(n)} moved to trash`,
    restore: (n) => `${plural(n)} restored`,
    snooze: (n, until) => `${plural(n)} snoozed until ${until ? snoozeLabel(until) : "later"}`,
    unsnooze: (n) => `${plural(n)} unsnoozed`,
    spam: (n) => `${plural(n)} marked as spam`,
    notSpam: (n) => `${plural(n)} moved to inbox`,
  };

  const inverse: Record<ThreadActionKind, ThreadActionKind | null> = {
    archive: "unarchive",
    unarchive: "archive",
    trash: "restore",
    restore: "trash",
    snooze: "unsnooze",
    unsnooze: null,
    spam: "notSpam",
    notSpam: "spam",
  };

  const call = async (kind: ThreadActionKind, owner: string, ids: string[], until?: Date) => {
    const input = { accountId: owner, threadIds: ids };
    switch (kind) {
      case "snooze":
        return mutations.snooze.mutateAsync({ ...input, until: until! });
      case "spam":
      case "notSpam":
        return mutations.setSpam.mutateAsync({ ...input, spam: kind === "spam" });
      default:
        return mutations[kind].mutateAsync(input);
    }
  };

  const run = async (
    kind: ThreadActionKind,
    ids: string[],
    { until, silent = false }: { until?: Date; silent?: boolean } = {},
  ) => {
    const groups = byAccount(ids);
    if (!groups.length) return;
    await queryClient.cancelQueries({ queryKey });
    const previous = removeFromList(ids);
    try {
      const results = await Promise.all(groups.map(([owner, gIds]) => call(kind, owner, gIds, until)));
      const failed = results.reduce((n, r) => n + (r?.failed ?? 0), 0);
      if (!silent) {
        const undo = inverse[kind];
        toast.success(messages[kind](ids.length, until), {
          description:
            failed > 0 ? `${failed} message${failed === 1 ? "" : "s"} couldn't be updated in your mailbox.` : undefined,
          action: undo ? { label: "Undo", onClick: () => void run(undo, ids, { silent: true }) } : undefined,
        });
      }
    } catch (error) {
      queryClient.setQueryData(queryKey, previous);
      toast.error(error instanceof Error && error.message ? error.message : "Couldn't update the thread. Try again.");
    } finally {
      settle();
    }
  };

  /** In-place changes (read state, star): update rows, don't remove them. */
  const toggle = async (kind: "read" | "star", ids: string[], value: boolean, { silent = true } = {}) => {
    const groups = byAccount(ids);
    if (!groups.length) return;
    await queryClient.cancelQueries({ queryKey });
    const previous = patchList((t) =>
      !ids.includes(t.id)
        ? t
        : kind === "star"
          ? { ...t, starred: value }
          : { ...t, emails: t.emails.map((e) => ({ ...e, status: value ? "read" : "unread" })) },
    );
    try {
      await Promise.all(
        groups.map(([owner, gIds]) =>
          kind === "star"
            ? mutations.setStarred.mutateAsync({ accountId: owner, threadIds: gIds, starred: value })
            : mutations.setRead.mutateAsync({ accountId: owner, threadIds: gIds, read: value }),
        ),
      );
      if (!silent) toast.success(kind === "star" ? (value ? "Starred" : "Star removed") : value ? "Marked as read" : "Marked as unread");
    } catch (error) {
      queryClient.setQueryData(queryKey, previous);
      toast.error(error instanceof Error && error.message ? error.message : "Couldn't update the thread.");
    } finally {
      void utils.mail.getThreadCounts.invalidate();
      void utils.mail.getThreadById.invalidate();
      if (kind === "star") void utils.mail.getThreads.invalidate();
    }
  };

  return {
    archive: (ids: string[]) => run("archive", ids),
    unarchive: (ids: string[]) => run("unarchive", ids),
    trash: (ids: string[]) => run("trash", ids),
    restore: (ids: string[]) => run("restore", ids),
    snooze: (ids: string[], until: Date) => run("snooze", ids, { until }),
    unsnooze: (ids: string[]) => run("unsnooze", ids),
    spam: (ids: string[]) => run("spam", ids),
    notSpam: (ids: string[]) => run("notSpam", ids),
    setRead: (ids: string[], read: boolean, opts?: { silent?: boolean }) => toggle("read", ids, read, opts),
    setStarred: (ids: string[], starred: boolean) => toggle("star", ids, starred, { silent: false }),
    /** Kept for existing callers: "Done" is a provider archive. */
    markDone: (ids: string[]) => run("archive", ids),
    markUndone: (ids: string[]) => run("unarchive", ids),
    isPending: Object.values(mutations).some((m) => m.isPending),
  };
}
