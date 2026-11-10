import { api, type RouterOutputs } from "@/trpc/react";
import { getQueryKey } from "@trpc/react-query";
import React from "react";
import { useLocalStorage } from "usehooks-ts";

export type ThreadListItem =
  RouterOutputs["mail"]["getThreads"]["threads"][number];

const PAGE_SIZE = 25;

/**
 * Cursor-paginated thread list (pattern borrowed from Zero/Mail0's useThreads):
 * pages load on demand instead of a fixed `take: 15`, and the list payload
 * carries only the latest snippet, not every message body.
 */
const useThreads = () => {
  const { data: accounts } = api.mail.getAccounts.useQuery();
  const [accountId] = useLocalStorage("accountId", "");
  const [tab] = useLocalStorage("normalhuman-tab", "inbox");
  const [done] = useLocalStorage("normalhuman-done", false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const input = { accountId, tab, done, limit: PAGE_SIZE };
  const queryKey = getQueryKey(api.mail.getThreads, input, "infinite");

  const query = api.mail.getThreads.useInfiniteQuery(input, {
    enabled: !!accountId && !!tab && mounted,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: (prev) => prev,
    // New mail arrives via the Aurinko webhook → DB, so a gentle poll plus
    // refetch-on-focus is enough; the old 5s poll re-downloaded every body.
    refetchInterval: 1000 * 30,
    refetchOnWindowFocus: true,
  });

  const threads = React.useMemo(
    () => query.data?.pages.flatMap((p) => p.threads) ?? [],
    [query.data],
  );

  return {
    threads,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: !!query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    account: accounts?.find((account) => account.id === accountId),
    refetch: query.refetch,
    accounts,
    queryKey,
    accountId,
    done,
    tab,
  };
};

export default useThreads;

/** The open thread with full message bodies, scoped to the current account. */
export const useCurrentThread = (threadId: string | null | undefined) => {
  const [accountId] = useLocalStorage("accountId", "");
  return api.mail.getThreadById.useQuery(
    { accountId, threadId: threadId ?? "" },
    { enabled: !!accountId && !!threadId, staleTime: 60 * 1000 },
  );
};
