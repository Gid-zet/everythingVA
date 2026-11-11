"use client";

import * as React from "react";
import { AlertTriangle, Inbox, Plus } from "lucide-react";
import { useLocalStorage } from "usehooks-ts";

import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/trpc/react";
import { ALL_ACCOUNTS } from "../use-threads";

interface AccountSwitcherProps {
  isCollapsed: boolean;
}

/** Switch between mailboxes or the unified inbox. Status comes from accounts.list. */
export function AccountSwitcher({ isCollapsed }: AccountSwitcherProps) {
  const { data } = api.accounts.list.useQuery(undefined, { refetchInterval: 60_000 });
  const accounts = data?.accounts;
  const [accountId, setAccountId] = useLocalStorage("accountId", "");
  const [, setTab] = useLocalStorage("normalhuman-tab", "inbox");
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Keep the selection valid: default to the unified inbox with 2+ accounts.
  React.useEffect(() => {
    if (!mounted || !accounts) return;
    if (accounts.length === 0) {
      if (accountId) setAccountId("");
      setTab("accounts");
      return;
    }
    const valid = accountId === ALL_ACCOUNTS ? accounts.length > 1 : accounts.some((a) => a.id === accountId);
    if (!valid) setAccountId(accounts.length > 1 ? ALL_ACCOUNTS : accounts[0]!.id);
  }, [accounts, accountId, mounted, setAccountId, setTab]);

  if (!accounts || !mounted) return <div className="h-9 w-full animate-pulse rounded-md bg-muted" />;

  const current = accounts.find((a) => a.id === accountId);
  const label = accountId === ALL_ACCOUNTS ? "All inboxes" : current?.emailAddress ?? "Connect an account";
  const attention = accounts.filter((a) => a.status === "needs_reauth" || a.status === "error").length;

  return (
    <div className="flex w-full items-center gap-2">
      <Select
        value={accountId || undefined}
        onValueChange={(v) => {
          if (v === "__add") {
            setTab("accounts");
            return;
          }
          setAccountId(v);
        }}
      >
        <SelectTrigger
          className={cn(
            "flex h-9 w-full flex-1 items-center gap-2 border-transparent bg-transparent text-[13px] shadow-none hover:bg-foreground/[0.04] [&>span]:flex [&>span]:min-w-0 [&>span]:items-center [&>span]:gap-2",
            isCollapsed && "h-9 w-9 shrink-0 justify-center p-0 [&>svg]:hidden",
          )}
          aria-label="Select account"
        >
          <SelectValue placeholder="Select an account">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand text-[11px] font-semibold uppercase text-brand-foreground">
              {accountId === ALL_ACCOUNTS ? <Inbox className="size-3.5" /> : (current?.emailAddress[0] ?? "?")}
            </span>
            {!isCollapsed && <span className="truncate font-medium">{label}</span>}
            {!isCollapsed && attention > 0 && <AlertTriangle className="size-3.5 shrink-0 text-amber-500" aria-label="An account needs attention" />}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {accounts.length > 1 && (
            <>
              <SelectItem value={ALL_ACCOUNTS}>
                <span className="flex items-center gap-2">
                  <Inbox className="size-4" /> All inboxes
                </span>
              </SelectItem>
              <SelectSeparator />
            </>
          )}
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <span className="flex items-center gap-2">
                {a.emailAddress}
                <span className="text-[11px] text-muted-foreground">{a.providerLabel}</span>
                {a.status === "needs_reauth" && <span className="text-[11px] text-amber-600">Reconnect</span>}
              </span>
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value="__add">
            <span className="flex items-center gap-2">
              <Plus className="size-4" /> Manage accounts
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
