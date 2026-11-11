"use client";

import React from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const ACTION_OPTIONS = [
  { value: "LABEL", label: "Add label" },
  { value: "ARCHIVE", label: "Archive (skip inbox)" },
  { value: "MARK_READ", label: "Mark as read" },
  { value: "STAR", label: "Star" },
  { value: "MARK_SPAM", label: "Mark as spam" },
  { value: "DRAFT_REPLY", label: "Draft a reply with AI" },
] as const;

type ActionType = (typeof ACTION_OPTIONS)[number]["value"];
type DraftAction = { type: ActionType; label?: string | null; content?: string | null };

export interface RuleDraft {
  name: string;
  enabled?: boolean;
  instructions?: string | null;
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  conditionalOperator?: "AND" | "OR";
  actions?: DraftAction[];
}

const EMPTY: Required<Omit<RuleDraft, "enabled">> & { enabled: boolean } = {
  name: "",
  enabled: true,
  instructions: "",
  from: "",
  to: "",
  subject: "",
  body: "",
  conditionalOperator: "AND",
  actions: [{ type: "LABEL", label: "" }],
};

/** Create or edit an organizer rule. */
export function RuleEditor({
  accountId,
  open,
  onOpenChange,
  ruleId,
  initial,
}: {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleId?: string;
  initial?: RuleDraft;
}) {
  const utils = api.useUtils();
  const [rule, setRule] = React.useState(EMPTY);
  React.useEffect(() => {
    if (!open) return;
    setRule({
      ...EMPTY,
      ...Object.fromEntries(Object.entries(initial ?? {}).map(([k, v]) => [k, v ?? (EMPTY as Record<string, unknown>)[k]])),
      actions: (initial?.actions?.length ? initial.actions : EMPTY.actions).map((a) => ({ ...a })),
    } as typeof EMPTY);
  }, [open, initial]);

  const create = api.organizer.createRule.useMutation();
  const update = api.organizer.updateRule.useMutation();
  const saving = create.isPending || update.isPending;

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setRule((r) => ({ ...r, [k]: v }));
  const setAction = (i: number, patch: Partial<DraftAction>) =>
    setRule((r) => ({ ...r, actions: r.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));

  const hasCondition = !!(rule.instructions?.trim() || rule.from?.trim() || rule.to?.trim() || rule.subject?.trim() || rule.body?.trim());
  const labelsOk = rule.actions.every((a) => a.type !== "LABEL" || a.label?.trim());
  const valid = rule.name.trim() && hasCondition && rule.actions.length > 0 && labelsOk;

  const save = async () => {
    const payload = {
      name: rule.name.trim(),
      enabled: rule.enabled,
      instructions: rule.instructions?.trim() || null,
      from: rule.from?.trim() || null,
      to: rule.to?.trim() || null,
      subject: rule.subject?.trim() || null,
      body: rule.body?.trim() || null,
      conditionalOperator: rule.conditionalOperator,
      actions: rule.actions.map((a) => ({
        type: a.type,
        ...(a.type === "LABEL" && a.label ? { label: a.label.trim() } : {}),
        ...(a.type === "DRAFT_REPLY" && a.content ? { content: a.content.trim() } : {}),
      })),
    };
    try {
      if (ruleId) await update.mutateAsync({ accountId, ruleId, rule: payload });
      else await create.mutateAsync({ accountId, rule: payload });
      toast.success(ruleId ? "Rule saved" : "Rule created");
      void utils.organizer.overview.invalidate();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the rule");
    }
  };

  const hasStatic = !!(rule.from || rule.to || rule.subject || rule.body);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{ruleId ? "Edit rule" : "New rule"}</DialogTitle>
          <DialogDescription>Choose which emails match, then what happens to them.</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) void save();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="rule-name">Name</Label>
            <Input id="rule-name" value={rule.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Finance" autoFocus />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="rule-ai">When an email is… (AI)</Label>
            <Textarea
              id="rule-ai"
              rows={3}
              value={rule.instructions ?? ""}
              onChange={(e) => set("instructions", e.target.value)}
              placeholder="Invoices, receipts or anything from my accountant about taxes"
            />
            <p className="text-[11px] text-muted-foreground">Describe the emails in plain English. Leave empty to match on patterns only.</p>
          </div>

          <fieldset className="grid gap-2 rounded-lg border p-3">
            <legend className="px-1 text-[12px] font-medium">Patterns (optional)</legend>
            {(["from", "to", "subject", "body"] as const).map((f) => (
              <div key={f} className="grid grid-cols-[64px_1fr] items-center gap-2">
                <Label htmlFor={`rule-${f}`} className="text-[12px] capitalize text-muted-foreground">
                  {f}
                </Label>
                <Input
                  id={`rule-${f}`}
                  value={rule[f] ?? ""}
                  onChange={(e) => set(f, e.target.value)}
                  placeholder={f === "from" ? "@stripe.com | billing@*" : f === "subject" ? "invoice | receipt" : ""}
                  className="h-8 text-[13px]"
                />
              </div>
            ))}
            {hasStatic && !!rule.instructions?.trim() && (
              <div className="flex items-center gap-2 pt-1 text-[12px]">
                <span className="text-muted-foreground">Patterns and AI must</span>
                <Select value={rule.conditionalOperator} onValueChange={(v) => set("conditionalOperator", v as "AND" | "OR")}>
                  <SelectTrigger className="h-7 w-[150px] text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND">both match</SelectItem>
                    <SelectItem value="OR">either match</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </fieldset>

          <div className="grid gap-2">
            <Label>Then</Label>
            {rule.actions.map((a, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[180px_1fr_auto]">
                <Select value={a.type} onValueChange={(v) => setAction(i, { type: v as ActionType })}>
                  <SelectTrigger className="h-8 text-[13px]" aria-label="Action">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {a.type === "LABEL" ? (
                  <Input value={a.label ?? ""} onChange={(e) => setAction(i, { label: e.target.value })} placeholder="Label name" className="h-8 text-[13px]" aria-label="Label name" />
                ) : a.type === "DRAFT_REPLY" ? (
                  <Input value={a.content ?? ""} onChange={(e) => setAction(i, { content: e.target.value })} placeholder="Guidance, e.g. politely decline" className="h-8 text-[13px]" aria-label="Reply guidance" />
                ) : (
                  <span />
                )}
                <Button type="button" variant="ghost" size="icon" className="size-8" disabled={rule.actions.length === 1} onClick={() => set("actions", rule.actions.filter((_, j) => j !== i))} aria-label="Remove action">
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
            {rule.actions.length < 6 && (
              <Button type="button" variant="ghost" size="sm" className="justify-self-start gap-1.5" onClick={() => set("actions", [...rule.actions, { type: "ARCHIVE" }])}>
                <Plus className="size-3.5" /> Add action
              </Button>
            )}
          </div>

          {!hasCondition && rule.name && <p className="text-[12px] text-destructive">Add AI instructions or at least one pattern.</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving} isLoading={saving}>
              {ruleId ? "Save rule" : "Create rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
