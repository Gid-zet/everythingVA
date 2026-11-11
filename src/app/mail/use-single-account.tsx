"use client";

import React from "react";
import { useLocalStorage } from "usehooks-ts";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_ACCOUNTS } from "./use-threads";

/**
 * Some features work on one mailbox at a time (organizer, rules, bulk
 * unsubscribe, Ask AI, AI search, pushing labels). When the switcher is on
 * "All inboxes", they use a separately remembered "working account" instead of
 * sending the "all" placeholder to the server.
 */
export function useSingleAccount() {
  const [selected] = useLocalStorage("accountId", "");
  const [workAccount, setWorkAccount] = useLocalStorage("workAccountId", "");
  const { data, isLoading } = api.mail.getAccounts.useQuery();
  const accounts = data ?? [];
  const isUnified = selected === ALL_ACCOUNTS;

  const accountId = !isUnified
    ? selected
    : accounts.some((a) => a.id === workAccount)
      ? workAccount
      : (accounts[0]?.id ?? "");

  return {
    accountId,
    account: accounts.find((a) => a.id === accountId),
    accounts,
    isUnified,
    isLoading,
    setAccountId: setWorkAccount,
  };
}

/** Account chooser shown only in "All inboxes" mode with 2+ accounts. */
export function SingleAccountPicker({ label = "Account", className }: { label?: string; className?: string }) {
  const { accountId, accounts, isUnified, setAccountId } = useSingleAccount();
  if (!isUnified || accounts.length < 2) return null;
  return (
    <div className={cn("flex items-center gap-2 text-[12px] text-muted-foreground", className)}>
      <span className="shrink-0">{label}</span>
      <Select value={accountId} onValueChange={setAccountId}>
        <SelectTrigger className="h-7 min-w-0 flex-1 text-[12px]" aria-label={`${label} for this feature`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id} className="text-[12px]">
              {a.emailAddress}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
