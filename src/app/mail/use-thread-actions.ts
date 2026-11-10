import { api, type RouterOutputs } from "@/trpc/react";
import type { InfiniteData } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import useThreads from "./use-threads";
import { useThread } from "./use-thread";

type Page = RouterOutputs["mail"]["getThreads"];

/**
 * Optimistic done/undone with an Undo toast — modelled on Zero's
 * useOptimisticActions: the row leaves the list immediately, the server call
 * runs in the background, and a failure rolls the cache back.
 */
export function useThreadActions() {
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const { threads, queryKey, accountId } = useThreads();
  const [threadId, setThreadId] = useThread();

  const setDone = api.mail.setDone.useMutation();
  const setUndone = api.mail.setUndone.useMutation();

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
    void queryClient.invalidateQueries({ queryKey });
    void utils.mail.getThreadCounts.invalidate();
  };

  const run = async (
    ids: string[],
    kind: "done" | "undone",
    { silent = false }: { silent?: boolean } = {},
  ) => {
    if (!ids.length || !accountId) return;
    await queryClient.cancelQueries({ queryKey });
    const previous = removeFromList(ids);
    const mutation = kind === "done" ? setDone : setUndone;
    try {
      await mutation.mutateAsync({ accountId, threadIds: ids });
      if (!silent) {
        const n = ids.length;
        toast.success(
          kind === "done"
            ? `${n > 1 ? `${n} threads` : "Thread"} marked done`
            : `${n > 1 ? `${n} threads` : "Thread"} moved to inbox`,
          {
            action: {
              label: "Undo",
              onClick: () => void run(ids, kind === "done" ? "undone" : "done", { silent: true }),
            },
          },
        );
      }
    } catch (error) {
      queryClient.setQueryData(queryKey, previous);
      toast.error("Couldn't update the thread. Please try again.");
    } finally {
      settle();
    }
  };

  return {
    markDone: (ids: string[]) => run(ids, "done"),
    markUndone: (ids: string[]) => run(ids, "undone"),
    isPending: setDone.isPending || setUndone.isPending,
  };
}
