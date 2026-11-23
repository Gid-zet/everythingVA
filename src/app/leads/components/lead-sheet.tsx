"use client";
import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Ban, CalendarPlus, ExternalLink, Loader2, Mail, PenLine, Sparkles, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SOURCES, STAGES, type DraftResult, type Lead, type LeadsStore } from "./store";
import { Avatar, FitPill, ago } from "./leads-app";

const addDaysLocal = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function LeadSheet({
  store,
  lead,
  onClose,
  onQualify,
  qualifying,
}: {
  store: LeadsStore;
  lead: Lead | null;
  onClose: () => void;
  onQualify: (id: string) => void;
  qualifying: boolean;
}) {
  const detail = store.useLead(lead?.id ?? null);
  const accounts = store.data?.accounts ?? [];
  const [accountId, setAccountId] = React.useState("");
  const [instructions, setInstructions] = React.useState("");
  const [drafting, setDrafting] = React.useState(false);
  const [draft, setDraft] = React.useState<DraftResult | null>(null);
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    setDraft(null);
    setInstructions("");
    setNotes(lead?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);
  React.useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  if (!lead) return <Sheet open={false} />;

  async function writeDraft() {
    if (!lead) return;
    setDrafting(true);
    try {
      const r = await store.draftOutreach({ id: lead.id, accountId, instructions: instructions.trim() || undefined });
      setDraft(r);
      toast.success("Saved to Drafts. Review it before sending.");
    } catch {
      /* toast shown by the store */
    } finally {
      setDrafting(false);
    }
  }

  const canEmail = !!lead.email && !lead.doNotContact;
  const field = "w-full rounded-xl bg-background px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-foreground/30";

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-lg">
        <div className="border-b p-5">
          <div className="flex items-center gap-3">
            <Avatar lead={lead} size="lg" />
            <div className="min-w-0">
              <SheetTitle className="truncate font-tight text-xl font-bold tracking-tight">{lead.name ?? lead.email}</SheetTitle>
              <SheetDescription className="truncate">{[lead.title, lead.company].filter(Boolean).join(" · ") || "No company yet"}</SheetDescription>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <Mail className="size-3.5" /> {lead.email}
              </a>
            )}
            {lead.phone && <span>{lead.phone}</span>}
            {lead.domain && (
              <a href={`https://${lead.domain}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-foreground">
                <ExternalLink className="size-3.5" /> {lead.domain}
              </a>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {STAGES.map((s) => (
              <button
                key={s.id}
                onClick={() => store.update({ id: lead.id, stage: s.id })}
                className={cn("rounded-lg px-2 py-1 text-[11px] font-medium transition", lead.stage === s.id ? s.tone + " ring-1 ring-current/20" : "text-muted-foreground hover:bg-muted")}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <section className="space-y-3 border-b p-5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold">AI verdict</p>
            <button disabled={qualifying} onClick={() => onQualify(lead.id)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-500/10">
              {qualifying ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {lead.fit ? "Re-score" : "Score with AI"}
            </button>
          </div>
          {lead.fit ? (
            <div className="rounded-2xl bg-muted/50 p-3.5">
              <div className="flex items-center gap-2">
                <FitPill lead={lead} />
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className={cn("block h-full rounded-full", lead.fit === "strong" ? "bg-emerald-500" : lead.fit === "possible" ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${lead.score ?? 0}%` }} />
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed">{lead.fitReason}</p>
              {lead.nextStep && <p className="mt-2 text-[13px] font-medium">→ {lead.nextStep}</p>}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">Not scored yet. AI compares this lead with your ideal customer and writes down why.</p>
          )}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["From them", lead.emailsIn],
              ["From you", lead.emailsOut],
              ["Last contact", ago(lead.lastContactAt) ?? "—"],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-muted/50 py-2">
                <p className="text-[15px] font-semibold tabular-nums">{v}</p>
                <p className="text-[10px] text-muted-foreground">{k}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2.5 border-b p-5">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            <PenLine className="size-4" /> Outreach
          </p>
          {!canEmail ? (
            <p className="rounded-xl bg-muted/50 p-3 text-[12px] text-muted-foreground">{lead.doNotContact ? "Marked do not contact, so outreach is off." : "Add an email address to write to this lead."}</p>
          ) : accounts.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              <Link href="/mail?tab=accounts" className="underline">Connect a mail account</Link> to write drafts.
            </p>
          ) : (
            <>
              {accounts.length > 1 && (
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={field} aria-label="Send from">
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      From {a.emailAddress}
                    </option>
                  ))}
                </select>
              )}
              <input value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={800} placeholder="Optional angle, e.g. mention our payroll audit offer" className={field} />
              <button disabled={drafting} onClick={writeDraft} className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2 text-[13px] font-semibold text-background hover:opacity-90 disabled:opacity-60">
                {drafting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Write a draft
              </button>
              <p className="text-[11px] text-muted-foreground">Saved to your Drafts in Mail. Nothing is sent until you press send.</p>
              {draft && (
                <div className="rounded-2xl bg-muted/50 p-3.5">
                  <p className="text-[13px] font-semibold">{draft.subject}</p>
                  <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-muted-foreground">{draft.preview}</p>
                  <Link href={`/mail?tab=drafts&account=${draft.accountId}`} className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium hover:underline">
                    Open in Drafts <ExternalLink className="size-3" />
                  </Link>
                </div>
              )}
            </>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={() => store.addFollowUp(lead, addDaysLocal(3))} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium ring-1 ring-border hover:bg-muted">
              <CalendarPlus className="size-3.5" /> Follow up in 3 days
            </button>
            <button
              onClick={() => store.update({ id: lead.id, doNotContact: !lead.doNotContact })}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium ring-1 ring-border hover:bg-muted", lead.doNotContact && "text-rose-600")}
            >
              <Ban className="size-3.5" /> {lead.doNotContact ? "Allow contact" : "Do not contact"}
            </button>
          </div>
        </section>

        <section className="space-y-2 border-b p-5">
          <p className="text-[13px] font-semibold">Notes</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== (lead.notes ?? "") && store.update({ id: lead.id, notes })}
            rows={4}
            maxLength={5000}
            placeholder="What you know, what they need…"
            className={field}
          />
          {lead.sourceDetail && (
            <p className="text-[12px] text-muted-foreground">
              Found via {SOURCES[lead.source].toLowerCase()}: {lead.sourceDetail}
            </p>
          )}
          {lead.consent && <p className="text-[12px] text-emerald-700 dark:text-emerald-300">Gave consent to be contacted.</p>}
          {lead.attribution && typeof lead.attribution === "object" && (
            <p className="text-[12px] text-muted-foreground">
              {Object.entries(lead.attribution as Record<string, string>)
                .filter(([k]) => k.startsWith("utm_") || k === "referrer")
                .map(([k, v]) => `${k.replace("utm_", "")}: ${v}`)
                .join(" · ")}
            </p>
          )}
        </section>

        <section className="p-5">
          <p className="mb-2 text-[13px] font-semibold">Activity</p>
          {!detail ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <ol className="space-y-2.5 border-l pl-4">
              {detail.activity.map((a) => (
                <li key={a.id} className="relative text-[12px]">
                  <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-muted-foreground/40 ring-2 ring-background" />
                  <span>{a.summary}</span>
                  <span className="ml-1.5 text-muted-foreground">{ago(a.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
          <button
            onClick={() => {
              if (!confirm("Delete this lead? This can't be undone.")) return;
              store.remove([lead.id]);
              onClose();
            }}
            className="mt-6 inline-flex items-center gap-1.5 text-[12px] text-rose-600 hover:underline"
          >
            <Trash2 className="size-3.5" /> Delete lead
          </button>
        </section>
      </SheetContent>
    </Sheet>
  );
}
