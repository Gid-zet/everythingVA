"use client";

import React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, CheckCircle2, Cloud, Loader2, LogOut, Mail, RefreshCw, Server } from "lucide-react";
import { toast } from "sonner";
import { useLocalStorage } from "usehooks-ts";

import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { connectUrl, reconnectUrl, type ConnectableService } from "@/lib/connect-url";
import { Button } from "@/components/ui/button";
import PushCategoriesButton from "@/components/push-categories-button";
import { ALL_ACCOUNTS } from "../use-threads";

const PROVIDERS: { service: ConnectableService; name: string; detail: string; mark: React.ReactNode }[] = [
  {
    service: "Google",
    name: "Google",
    detail: "Gmail and Google Workspace, with Google Calendar",
    mark: <span className="text-[15px] font-bold text-[#4285F4]">G</span>,
  },
  {
    service: "Office365",
    name: "Microsoft",
    detail: "Outlook.com and Microsoft 365, with Outlook Calendar",
    mark: (
      <span className="grid size-4 grid-cols-2 gap-px">
        <span className="bg-[#F25022]" />
        <span className="bg-[#7FBA00]" />
        <span className="bg-[#00A4EF]" />
        <span className="bg-[#FFB900]" />
      </span>
    ),
  },
  {
    service: "iCloud",
    name: "iCloud",
    detail: "iCloud Mail and Calendar (app-specific password)",
    mark: <Cloud className="size-4 text-sky-500" />,
  },
  {
    service: "IMAP",
    name: "Other (IMAP)",
    detail: "Fastmail, Zoho, Yahoo, company mail servers…",
    mark: <Server className="size-4 text-muted-foreground" />,
  },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    active: { label: "Connected", cls: "text-emerald-700 dark:text-emerald-400", icon: <CheckCircle2 className="size-3.5" /> },
    syncing: { label: "Syncing…", cls: "text-brand", icon: <Loader2 className="size-3.5 animate-spin" /> },
    needs_reauth: { label: "Needs reconnect", cls: "text-amber-700 dark:text-amber-300", icon: <AlertTriangle className="size-3.5" /> },
    error: { label: "Sync problem", cls: "text-red-600 dark:text-red-400", icon: <AlertTriangle className="size-3.5" /> },
  };
  const s = map[status] ?? map.active!;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12px] font-medium", s.cls)}>
      {s.icon}
      {s.label}
    </span>
  );
}

/** Connected accounts: add, reconnect, resync and disconnect. */
export function AccountsPanel() {
  const utils = api.useUtils();
  const list = api.accounts.list.useQuery(undefined, {
    refetchInterval: (q) => (q.state.data?.accounts.some((a) => a.status === "syncing") ? 4000 : 30_000),
  });
  const [accountId, setAccountId] = useLocalStorage("accountId", "");
  const [, setTab] = useLocalStorage("normalhuman-tab", "inbox");

  // Show the result of an OAuth round trip, then clean the URL.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("connectError");
    if (connected) {
      toast.success("Account connected. Your mail is syncing in the background.");
      setAccountId(connected);
    }
    if (error) toast.error(error, { duration: 10_000 });
    if (connected || error || params.get("tab")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [setAccountId]);

  const refresh = () => {
    void utils.accounts.list.invalidate();
    void utils.mail.getAccounts.invalidate();
    void utils.mail.getThreads.invalidate();
    void utils.calendar.overview.invalidate();
  };
  const resync = api.accounts.resync.useMutation({
    onSuccess: () => toast.success("Synced"),
    onError: (e) => toast.error(e.message),
    onSettled: refresh,
  });
  const disconnect = api.accounts.disconnect.useMutation({
    onSuccess: (_d, v) => {
      toast.success("Account disconnected");
      if (accountId === v.accountId) setAccountId(ALL_ACCOUNTS);
    },
    onError: (e) => toast.error(e.message),
    onSettled: refresh,
  });

  const accounts = list.data?.accounts ?? [];
  const atLimit = list.data ? accounts.length >= list.data.limit : false;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <h2 className="text-2xl font-semibold tracking-tight">Accounts</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect every inbox you use. Mail, calendars and contacts stay in your provider; EverythingVA keeps them in sync.
      </p>

      <section className="mt-8" aria-label="Connected accounts">
        {list.isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        ) : accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <Mail className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No accounts yet</p>
            <p className="text-[13px] text-muted-foreground">Pick a provider below to connect your first inbox.</p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.emailAddress}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                    <span>{a.providerLabel}</span>
                    <StatusBadge status={a.status} />
                    {a.lastSyncedAt && <span>Synced {formatDistanceToNowStrict(new Date(a.lastSyncedAt), { addSuffix: true })}</span>}
                  </p>
                  {a.statusMessage && a.status !== "active" && (
                    <p className="mt-1 text-[12px] text-muted-foreground">{a.statusMessage}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {a.status === "needs_reauth" ? (
                    <Button size="sm" asChild>
                      <a href={reconnectUrl(a.id)}>Reconnect</a>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      disabled={resync.isPending && resync.variables?.accountId === a.id}
                      onClick={() => resync.mutate({ accountId: a.id })}
                    >
                      <RefreshCw className={cn("size-3.5", resync.isPending && resync.variables?.accountId === a.id && "animate-spin")} />
                      Sync now
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-muted-foreground hover:text-destructive"
                    disabled={disconnect.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Disconnect ${a.emailAddress}? Your mail stays in your mailbox; EverythingVA's copy, drafts and organizer data for it are deleted.`,
                        )
                      ) {
                        disconnect.mutate({ accountId: a.id });
                      }
                    }}
                  >
                    <LogOut className="size-3.5" /> Disconnect
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-label="Add an account">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Add an account</h3>
          {list.data && (
            <span className="text-[12px] text-muted-foreground">
              {accounts.length} of {list.data.limit} on your plan
            </span>
          )}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <a
              key={p.service}
              href={atLimit ? undefined : connectUrl(p.service)}
              aria-disabled={atLimit}
              onClick={(e) => {
                if (atLimit) {
                  e.preventDefault();
                  toast.error("You've reached your plan's account limit. Disconnect one or upgrade.");
                }
              }}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 transition-colors hover:border-brand/40 hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                atLimit && "cursor-not-allowed opacity-60",
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background">{p.mark}</span>
              <span>
                <span className="block text-sm font-medium">{p.name}</span>
                <span className="block text-[12px] text-muted-foreground">{p.detail}</span>
              </span>
            </a>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">
          Sign-in happens on your provider&apos;s page. We never see your password, and you can revoke access at any time.
        </p>
      </section>

      {accounts.length > 0 && (
        <section className="mt-10 border-t pt-8" aria-label="Organizer labels">
          <h3 className="text-sm font-semibold">Organizer labels</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">Copy your organizer categories to your mailbox as labels or categories.</p>
          <div className="mt-3 max-w-sm">
            <PushCategoriesButton />
          </div>
        </section>
      )}

      <div className="mt-8">
        <Button variant="ghost" size="sm" onClick={() => setTab("inbox")}>
          Back to inbox
        </Button>
      </div>
    </div>
  );
}
