import { api, type RouterOutputs } from "@/trpc/react";
import type { InfiniteData } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { format, isToday, isTomorrow } from "date-fns";
import { toast } from "sonner";
import useThreads from "./use-threads";
import { useThread } from "./use-thread";

type Page = RouterOutputs["mail"]["getThreads"];

export type ThreadActionKind =
  | "archive"
  | "unarchive"
  | "trash"
  | "restore"
  | "snooze"
  | "unsnooze";

const plural = (n: number) => (n > 1 ? `${n} threads` : "Thread");

function snoozeLabel(until: Date) {
  const time = format(until, "h:mm a");
  if (isToday(until)) return `today at ${time}`;
  if (isTomorrow(until)) return `tomorrow at ${time}`;
  return format(until, "EEE, MMM d 'at' h:mm a");
}

/**
 * Optimistic, provider-synced thread actions with an Undo toast — modelled on
 * Zero's useOptimisticActions: the row leaves the list immediately, the
 * server call (DB + Aurinko) runs in the background, and a failure rolls the
 * cache back.
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
  };

  const removeFromList = (ids: string[]) => {
    const previous = queryClient.getQueryData<InfiniteData<Page>>(queryKey);
    queryClient.setQueryData<InfiniteData<Page>>(queryKey, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((p) => ({
              ...p,
              threads: p.threads.filter((t) => !ids.includes(t.id)),
            })),
          }
        : data,
    );

    // Move selection to the neighbour of the removed row.
    if (threadId && ids.includes(threadId)) {
      const idx = threads.findIndex((t) => t.id === threadId);
      const remaining = threads.filter((t) => !ids.includes(t.id));
      setThreadId(remaining[idx]?.id ?? remaining[idx - 1]?.id);
    }
    return previous;
  };

  const settle = () => {
    // Every list (inbox, done, snoozed, trash) may have changed.
    void utils.mail.getThreads.invalidate();
    void utils.mail.getThreadCounts.invalidate();
  };

  const messages: Record<ThreadActionKind, (n: number, until?: Date) => string> = {
    archive: (n) => `${plural(n)} archived`,
    unarchive: (n) => `${plural(n)} moved to inbox`,
    trash: (n) => `${plural(n)} moved to trash`,
    restore: (n) => `${plural(n)} restored`,
    snooze: (n, until) => `${plural(n)} snoozed until ${until ? snoozeLabel(until) : "later"}`,
    unsnooze: (n) => `${plural(n)} unsnoozed`,
  };

  const inverse: Record<ThreadActionKind, ThreadActionKind | null> = {
    archive: "unarchive",
    unarchive: "archive",
    trash: "restore",
    restore: "trash",
    snooze: "unsnooze",
    unsnooze: null,
  };

  const run = async (
    kind: ThreadActionKind,
    ids: string[],
    { until, silent = false }: { until?: Date; silent?: boolean } = {},
  ) => {
    if (!ids.length || !accountId) return;
    await queryClient.cancelQueries({ queryKey });
    const previous = removeFromList(ids);
    try {
      const input = { accountId, threadIds: ids };
      const result =
        kind === "snooze"
          ? await mutations.snooze.mutateAsync({ ...input, until: until! })
          : await mutations[kind].mutateAsync(input);

      if (!silent) {
        const undo = inverse[kind];
        toast.success(messages[kind](ids.length, until), {
          description:
            result.failed > 0
              ? `${result.failed} message${result.failed === 1 ? "" : "s"} couldn't be updated in your mailbox.`
              : undefined,
          action: undo
            ? { label: "Undo", onClick: () => void run(undo, ids, { silent: true }) }
            : undefined,
        });
      }
    } catch (error) {
      queryClient.setQueryData(queryKey, previous);
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Couldn't update the thread. Please try again.",
      );
    } finally {
      settle();
    }
  };

  return {
    archive: (ids: string[]) => run("archive", ids),
    unarchive: (ids: string[]) => run("unarchive", ids),
    trash: (ids: string[]) => run("trash", ids),
    restore: (ids: string[]) => run("restore", ids),
    snooze: (ids: string[], until: Date) => run("snooze", ids, { until }),
    unsnooze: (ids: string[]) => run("unsnooze", ids),
    /** Kept for existing callers: "Done" is now a provider archive. */
    markDone: (ids: string[]) => run("archive", ids),
    markUndone: (ids: string[]) => run("unarchive", ids),
    isPending: Object.values(mutations).some((m) => m.isPending),
  };
}
