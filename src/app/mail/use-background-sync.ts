"use client";

import React from "react";
import { useLocalStorage } from "usehooks-ts";
import { api } from "@/trpc/react";

/**
 * While the mail app is open, ask the server to catch up any account that
 * hasn't synced recently (on load, every 3 minutes and when the tab regains
 * focus). The server decides what's actually due, so this is cheap to call.
 * Provider webhooks remain the fast path; this is the safety net.
 */
export function useBackgroundSync() {
  const [accountId] = useLocalStorage("accountId", "");
  const utils = api.useUtils();
  const sync = api.mail.syncStale.useMutation({
    onSuccess: ({ started }) => {
      if (!started) return;
      // The sync runs after the response; pick up the results shortly after.
      const refresh = () => {
        void utils.mail.getThreads.invalidate();
        void utils.mail.getThreadCounts.invalidate();
        void utils.accounts.list.invalidate();
      };
      setTimeout(refresh, 15_000);
      setTimeout(refresh, 45_000);
    },
  });
  const mutate = sync.mutate;

  React.useEffect(() => {
    if (!accountId) return;
    const run = () => mutate({ accountId });
    run();
    const timer = setInterval(run, 3 * 60_000);
    const onFocus = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [accountId, mutate]);
}
