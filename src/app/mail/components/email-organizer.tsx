"use client";

import React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  Bot,
  CheckCheck,
  FlaskConical,
  History,
  Loader2,
  MailOpen,
  Pencil,
  Plus,
  ShieldAlert,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Undo2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { useSetAtom } from "jotai";

import { api, type RouterOutputs } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { threadIdAtom } from "@/lib/atoms";
import { RuleEditor, type RuleDraft } from "./organizer-rule-editor";

type Rule = RouterOutputs["organizer"]["overview"]["rules"][number];
type Action = { type: string; label?: string; content?: string };

const ACTION_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  LABEL: { label: "Label", icon: Tag },
  ARCHIVE: { label: "Archive", icon: Archive },
  MARK_READ: { label: "Mark read", icon: MailOpen },
  STAR: { label: "Star", icon: Star },
  MARK_SPAM: { label: "Spam", icon: ShieldAlert },
  DRAFT_REPLY: { label: "Draft reply", icon: Bot },
};

function ActionChips({ actions }: { actions: Action[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {actions.map((a, i) => {
        const meta = ACTION_META[a.type] ?? { label: a.type, icon: Tag };
        return (
          <span key={i} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-foreground/80">
            <meta.icon className="size-3" />
            {a.type === "LABEL" && a.label ? a.label : meta.label}
          </span>
        );
      })}
    </div>
  );
}

function conditionSummary(r: Rule) {
  const parts = [
    r.from && `from ${r.from}`,
    r.to && `to ${r.to}`,
    r.subject && `subject has ${r.subject}`,
    r.body && `body has ${r.body}`,
  ].filter(Boolean) as string[];
  const pattern = parts.join(" and ");
  if (pattern && r.instructions) return `${pattern} ${r.conditionalOperator === "OR" ? "or" : "and"} AI: “${r.instructions}”`;
  return pattern || `AI: “${r.instructions}”`;
}

const TABS = [
  { id: "rules", label: "Rules", icon: Wand2 },
  { id: "test", label: "Test", icon: FlaskConical },
  { id: "history", label: "History", icon: History },
] as const;

/**
 * Organizer: AI + pattern rules that label, archive, star, mark read/spam or
 * draft replies in the real mailbox (modelled on Inbox Zero's assistant).
 */
export function EmailOrganizer({ accountId }: { accountId: string }) {
  const utils = api.useUtils();
  const [tab, setTab] = React.useState<(typeof TABS)[number]["id"]>("rules");
  const [editor, setEditor] = React.useState<{ open: boolean; ruleId?: string; draft?: RuleDraft }>({ open: false });
  const [prompt, setPrompt] = React.useState("");

  const overview = api.organizer.overview.useQuery({ accountId });
  const setAutoRun = api.organizer.setAutoRun.useMutation({
    onSuccess: (_d, v) => toast.success(v.enabled ? "New mail will be organized automatically" : "Automatic organizing turned off"),
    onSettled: () => void utils.organizer.overview.invalidate(),
  });
  const toggle = api.organizer.toggleRule.useMutation({ onSettled: () => void utils.organizer.overview.invalidate() });
  const move = api.organizer.moveRule.useMutation({ onSettled: () => void utils.organizer.overview.invalidate() });
  const del = api.organizer.deleteRule.useMutation({
    onSuccess: () => toast.success("Rule deleted"),
    onSettled: () => void utils.organizer.overview.invalidate(),
  });
  const fromPrompt = api.organizer.ruleFromPrompt.useMutation({
    onSuccess: (draft) => {
      setEditor({ open: true, draft: { ...draft, enabled: true } as RuleDraft });
      setPrompt("");
    },
    onError: (e) => toast.error(e.message),
  });

  // Organize recent inbox mail in batches until nothing is left.
  const batch = api.organizer.processBatch.useMutation();
  const [progress, setProgress] = React.useState<{ done: number; applied: number; total?: number } | null>(null);
  const organizeInbox = async () => {
    setProgress({ done: 0, applied: 0 });
    let done = 0;
    let applied = 0;
    let errors = 0;
    try {
      for (let i = 0; i < 40; i++) {
        const r = await batch.mutateAsync({ accountId, sinceDays: 7 });
        done += r.processed;
        applied += r.applied;
        errors += r.errors;
        setProgress({ done, applied, total: done + r.remaining });
        if (r.remaining === 0 || r.processed === 0) break;
      }
      toast.success(`Organized ${done} email${done === 1 ? "" : "s"}: ${applied} matched a rule${errors ? `, ${errors} failed` : ""}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Organizing stopped early");
    } finally {
      setProgress(null);
      void utils.organizer.invalidate();
      void utils.mail.getThreads.invalidate();
      void utils.mail.getThreadCounts.invalidate();
    }
  };

  const rules = overview.data?.rules ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-5 py-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-semibold tracking-tight">Organizer</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Rules label, archive and draft replies in your mailbox. AI handles the judgement calls.
            </p>
          </div>
          <Button onClick={() => void organizeInbox()} disabled={!!progress || !rules.some((r) => r.enabled)} className="gap-1.5">
            {progress ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {progress ? `Organizing ${progress.done}${progress.total ? `/${progress.total}` : ""}…` : "Organize last 7 days"}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-muted-foreground">
          <label className="flex items-center gap-2">
            <Switch
              checked={!!overview.data?.autoRun}
              disabled={!overview.data || setAutoRun.isPending}
              onCheckedChange={(enabled) => setAutoRun.mutate({ accountId, enabled })}
              aria-label="Organize new mail automatically"
            />
            Organize new mail automatically
          </label>
          {overview.data && (
            <span>
              This week: <b className="font-medium text-foreground">{overview.data.week.applied}</b> organized ·{" "}
              {overview.data.week.skipped} no match{overview.data.week.errors ? ` · ${overview.data.week.errors} failed` : ""}
            </span>
          )}
        </div>
        <nav className="mt-4 flex gap-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
                tab === t.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === "rules" && (
          <div className="space-y-4">
            <form
              className="rounded-xl border bg-sidebar p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (prompt.trim().length >= 5) fromPrompt.mutate({ accountId, prompt });
              }}
            >
              <label className="text-[12px] font-medium" htmlFor="rule-prompt">
                Describe a rule
              </label>
              <Textarea
                id="rule-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                placeholder="e.g. Label anything from my accountant or about invoices as Finance and star it"
                className="mt-1.5 resize-none bg-background text-[13px]"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditor({ open: true })} className="gap-1.5">
                  <Plus className="size-3.5" /> Create manually
                </Button>
                <Button type="submit" size="sm" disabled={prompt.trim().length < 5 || fromPrompt.isPending} className="gap-1.5">
                  {fromPrompt.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  Create rule
                </Button>
              </div>
            </form>

            {overview.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : (
              <ol className="divide-y rounded-xl border">
                {rules.map((r, i) => (
                  <li key={r.id} className={cn("flex gap-3 p-3", !r.enabled && "opacity-60")}>
                    <Switch
                      checked={r.enabled}
                      onCheckedChange={(enabled) => toggle.mutate({ accountId, ruleId: r.id, enabled })}
                      aria-label={`Enable ${r.name}`}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13px] font-semibold">{r.name}</p>
                        {r.matchesThisWeek > 0 && (
                          <span className="text-[11px] text-muted-foreground">{r.matchesThisWeek} this week</span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">{conditionSummary(r)}</p>
                      <div className="mt-1.5">
                        <ActionChips actions={r.actions as Action[]} />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-start gap-0.5">
                      <Button variant="ghost" size="icon" className="size-7" disabled={i === 0} onClick={() => move.mutate({ accountId, ruleId: r.id, direction: "up" })} aria-label="Move up">
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" disabled={i === rules.length - 1} onClick={() => move.mutate({ accountId, ruleId: r.id, direction: "down" })} aria-label="Move down">
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditor({ open: true, ruleId: r.id, draft: r as unknown as RuleDraft })} aria-label={`Edit ${r.name}`}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        onClick={() => window.confirm(`Delete the rule "${r.name}"?`) && del.mutate({ accountId, ruleId: r.id })}
                        aria-label={`Delete ${r.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <p className="text-[12px] text-muted-foreground">
              Rules are checked top to bottom. Pattern-only rules match instantly; rules with AI instructions are compared
              together and the best fit wins. Patterns accept <code>|</code> for alternatives and <code>*</code> as a wildcard.
            </p>
          </div>
        )}

        {tab === "test" && <TestPanel accountId={accountId} />}
        {tab === "history" && <HistoryPanel accountId={accountId} />}
      </div>

      <RuleEditor
        accountId={accountId}
        open={editor.open}
        ruleId={editor.ruleId}
        initial={editor.draft}
        onOpenChange={(open) => setEditor((s) => ({ ...s, open }))}
      />
    </div>
  );
}

function TestPanel({ accountId }: { accountId: string }) {
  const utils = api.useUtils();
  const recent = api.organizer.recentMessages.useQuery({ accountId });
  const test = api.organizer.testMessage.useMutation();
  const run = api.organizer.runOnMessage.useMutation();
  const [results, setResults] = React.useState<Record<string, { rule: string | null; reason: string; actions?: Action[] }>>({});
  const [busy, setBusy] = React.useState<string | null>(null);

  const doTest = async (id: string) => {
    setBusy(id);
    try {
      const r = await test.mutateAsync({ accountId, messageId: id });
      if (r.status === "TEST") {
        setResults((s) => ({ ...s, [id]: { rule: r.rule?.name ?? null, reason: r.reason, actions: (r.rule?.actions as Action[]) ?? [] } }));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setBusy(null);
    }
  };

  const doRun = async (id: string) => {
    setBusy(id);
    try {
      const r = await run.mutateAsync({ accountId, messageId: id, force: true });
      toast.success(r.status === "APPLIED" ? "Rule applied" : r.status === "SKIPPED" ? "No rule matched" : "Rule run failed");
      void utils.organizer.invalidate();
      void utils.mail.getThreads.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusy(null);
    }
  };

  if (recent.isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (!recent.data?.length) return <p className="text-sm text-muted-foreground">No received mail to test yet.</p>;

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted-foreground">
        Test shows which rule would match and why, without changing anything. Run applies it.
      </p>
      <ul className="divide-y rounded-xl border">
        {recent.data.map((e) => {
          const res = results[e.id];
          return (
            <li key={e.id} className="p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{e.subject || "(no subject)"}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {e.from.name || e.from.address} · {formatDistanceToNowStrict(new Date(e.sentAt), { addSuffix: true })}
                    {e.run && ` · ${e.run.status === "APPLIED" ? `organized by ${e.run.rule?.name ?? "a rule"}` : e.run.status.toLowerCase()}`}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-[12px]" disabled={busy === e.id} onClick={() => void doTest(e.id)}>
                  {busy === e.id && test.isPending ? <Loader2 className="size-3 animate-spin" /> : <FlaskConical className="size-3" />}
                  Test
                </Button>
                <Button size="sm" className="h-7 text-[12px]" disabled={busy === e.id} onClick={() => void doRun(e.id)}>
                  Run
                </Button>
              </div>
              {res && (
                <div className="mt-2 rounded-lg bg-muted/60 p-2.5 text-[12px]">
                  <p className="font-medium">{res.rule ? `Would apply “${res.rule}”` : "No rule would apply"}</p>
                  <p className="mt-0.5 text-muted-foreground">{res.reason}</p>
                  {res.actions && res.actions.length > 0 && (
                    <div className="mt-1.5">
                      <ActionChips actions={res.actions} />
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HistoryPanel({ accountId }: { accountId: string }) {
  const utils = api.useUtils();
  const setThreadId = useSetAtom(threadIdAtom);
  const history = api.organizer.history.useInfiniteQuery(
    { accountId },
    { getNextPageParam: (p) => p.nextCursor ?? undefined, refetchInterval: 30_000 },
  );
  const undo = api.organizer.undo.useMutation({
    onSuccess: () => toast.success("Undone"),
    onError: (e) => toast.error(e.message),
    onSettled: () => {
      void utils.organizer.invalidate();
      void utils.mail.getThreads.invalidate();
    },
  });
  const runs = history.data?.pages.flatMap((p) => p.runs) ?? [];

  if (history.isLoading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (!runs.length)
    return (
      <div className="rounded-xl border border-dashed p-6 text-center text-[13px] text-muted-foreground">
        Nothing organized yet. Use “Organize last 7 days” or turn on automatic organizing.
      </div>
    );

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-xl border">
        {runs.map((r) => {
          const actions = (r.actions as unknown as (Action & { status: string })[]) ?? [];
          return (
            <li key={r.id} className="flex gap-3 p-3">
              <span
                className={cn(
                  "mt-1 size-2 shrink-0 rounded-full",
                  r.status === "APPLIED" && "bg-emerald-500",
                  r.status === "SKIPPED" && "bg-muted-foreground/40",
                  r.status === "ERROR" && "bg-red-500",
                  r.status === "UNDONE" && "bg-amber-500",
                )}
                aria-label={r.status}
              />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setThreadId(r.threadId)}>
                <p className="truncate text-[13px] font-medium">{r.email?.subject || "(no subject)"}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {r.status === "APPLIED" ? r.rule?.name ?? "Rule" : r.status === "SKIPPED" ? "No rule matched" : r.status === "UNDONE" ? `Undone · ${r.rule?.name ?? ""}` : "Failed"}
                  {" · "}
                  {r.email?.from.name || r.email?.from.address}
                  {" · "}
                  {formatDistanceToNowStrict(new Date(r.createdAt), { addSuffix: true })}
                  {r.automated && " · automatic"}
                </p>
                {r.reason && <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground/80">{r.reason}</p>}
                {actions.length > 0 && r.status !== "SKIPPED" && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {actions.map((a, i) => (
                      <span
                        key={i}
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[11px]",
                          a.status === "done" ? "bg-muted" : "bg-red-500/10 text-red-600 dark:text-red-400",
                        )}
                        title={a.status !== "done" ? (a as { error?: string }).error : undefined}
                      >
                        {a.type === "LABEL" ? a.label : ACTION_META[a.type]?.label ?? a.type}
                        {a.status !== "done" && ` (${a.status})`}
                      </span>
                    ))}
                  </div>
                )}
              </button>
              {r.status === "APPLIED" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1 text-[12px]"
                  disabled={undo.isPending}
                  onClick={() => undo.mutate({ accountId, runId: r.id })}
                >
                  <Undo2 className="size-3" /> Undo
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {history.hasNextPage && (
        <Button variant="ghost" size="sm" className="w-full gap-1.5" onClick={() => void history.fetchNextPage()} disabled={history.isFetchingNextPage}>
          {history.isFetchingNextPage ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}
          Load more
        </Button>
      )}
    </div>
  );
}
