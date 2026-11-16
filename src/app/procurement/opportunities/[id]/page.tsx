"use client";
import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Bot, CheckCircle2, Circle, ExternalLink, Loader2, Lock, Paperclip, Sparkles, Trash2, User, Cog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { APPROVAL_STATUSES, SOURCE_LABELS, STATUS_LABELS, type OpportunityStatusId } from "@/server/procurement/types";
import type { Qualification } from "@/server/procurement/qualification-rules";
import {
  EligibilityBadge,
  EmptyState,
  Field,
  FitScore,
  RecommendationBadge,
  Section,
  StatusBadge,
  formatDate,
  inputClass,
  money,
  relativeDays,
} from "../../components/bits";

type StoredQualification = Qualification & { guardRailNotes?: string[] };

const toLocalInput = (d: Date | null | undefined) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export default function OpportunityPage() {
  const { id } = useParams<{ id: string }>();
  const utils = api.useUtils();
  const { data: o, isLoading, error } = api.procurement.opportunity.useQuery({ id });
  const refresh = () => void utils.procurement.invalidate();
  const update = api.procurement.updateOpportunity.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const qualify = api.procurement.qualify.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });

  if (isLoading) return <Loader2 className="mx-auto mt-20 size-5 animate-spin text-muted-foreground" />;
  if (error || !o) return <EmptyState title="Opportunity not found">{error?.message}</EmptyState>;

  const q = o.qualification as StoredQualification | null;
  const isAdmin = o.myRole === "owner" || o.myRole === "admin";
  const isEditor = o.myRole !== "viewer";
  const attachments = (Array.isArray(o.attachments) ? o.attachments : []) as { name?: string; url: string }[];
  const contacts = (Array.isArray(o.contacts) ? o.contacts : []) as { name?: string; email?: string; phone?: string }[];

  return (
    <>
      <Link href="/procurement/opportunities" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Opportunities
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={o.status} />
            <EligibilityBadge value={o.eligibility} />
            <RecommendationBadge value={o.recommendation} />
          </div>
          <h1 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">{o.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {o.organization ?? "Unknown issuer"} · {SOURCE_LABELS[o.source]}
            {o.referenceNumber ? ` · Ref ${o.referenceNumber}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" asChild>
            <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 size-4" /> Original notice
            </a>
          </Button>
          {isEditor && (
            <Button onClick={() => qualify.mutate({ id: o.id })} disabled={qualify.isPending}>
              {qualify.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
              {qualify.isPending ? "Assessing…" : o.qualifiedAt ? "Re-assess fit" : "Assess fit"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Key facts">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Fact label="Deadline" value={o.deadline ? `${formatDate(o.deadline, true)} (${relativeDays(o.deadline)})` : "Not stated"} />
              <Fact label="Posted" value={formatDate(o.postedAt)} />
              <Fact label="Discovered" value={formatDate(o.discoveredAt, true)} />
              <Fact label="Notice type" value={o.noticeType ?? "–"} />
              <Fact label="Set-aside / preference" value={o.setAside ?? "None stated"} />
              <Fact label="Place of performance" value={[o.placeOfPerformance, o.country].filter(Boolean).join(" · ") || "–"} />
              <Fact label="Estimated value" value={o.estimatedValue ? money(o.estimatedValue, o.currency ?? "USD") : "Not published"} />
              <Fact label="Codes" value={o.classificationCodes.join(", ") || "–"} />
              {o.amendedAt && <Fact label="Last amended" value={`${formatDate(o.amendedAt)}${o.amendmentNumber ? ` (amendment ${o.amendmentNumber})` : ""}`} />}
              {o.matchedKeywords.length > 0 && <Fact label={`Keyword relevance ${o.relevance}`} value={o.matchedKeywords.join(", ")} />}
            </dl>
          </Section>

          <Section
            title="Fit assessment"
            description={o.qualifiedAt ? `By the qualification agent on ${formatDate(o.qualifiedAt, true)}. Check it before deciding.` : "Not assessed yet."}
            actions={<FitScore score={o.fitScore} />}
          >
            {q ? <QualificationView q={q} /> : <p className="text-sm text-muted-foreground">Press “Assess fit” to compare this opportunity with your verified profile.</p>}
          </Section>

          <Section title="Description">
            {o.description ? (
              <p className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">{o.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {o.descriptionUrl ? "The description is fetched from SAM.gov when the fit is assessed." : "No description was published with the notice."}
              </p>
            )}
            {attachments.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <p className="mb-2 text-xs font-medium">Solicitation documents ({attachments.length})</p>
                <ul className="space-y-1">
                  {attachments.map((a, i) => (
                    <li key={i}>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline">
                        <Paperclip className="size-3.5" /> {a.name || `Document ${i + 1}`}
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-muted-foreground">Attachments aren't read by the agents yet; review them before deciding.</p>
              </div>
            )}
            {contacts.length > 0 && (
              <div className="mt-4 border-t pt-3 text-sm">
                <p className="mb-1 text-xs font-medium">Contacts</p>
                {contacts.map((c, i) => (
                  <p key={i} className="text-muted-foreground">
                    {[c.name, c.email, c.phone].filter(Boolean).join(" · ")}
                  </p>
                ))}
              </div>
            )}
          </Section>

          <History logs={o.auditLogs} />
        </div>

        <div className="space-y-6">
          <Section title="Pipeline">
            <div className="space-y-3">
              <Field label="Status" hint={isAdmin ? undefined : "Approving, declining and submitting need an admin."}>
                <select
                  className={inputClass}
                  value={o.status}
                  disabled={!isEditor || update.isPending}
                  onChange={(e) => update.mutate({ id: o.id, status: e.target.value as OpportunityStatusId })}
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => {
                    const locked = APPROVAL_STATUSES.includes(k as OpportunityStatusId) && !isAdmin && k !== o.status;
                    return (
                      <option key={k} value={k} disabled={locked}>
                        {v}
                        {locked ? " (admin)" : ""}
                      </option>
                    );
                  })}
                </select>
              </Field>
              <Field label="Owner">
                <select
                  className={inputClass}
                  value={o.ownerId ?? ""}
                  disabled={!isEditor}
                  onChange={(e) => update.mutate({ id: o.id, ownerId: e.target.value || null })}
                >
                  <option value="">Unassigned</option>
                  {o.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {[m.firstName, m.lastName].filter(Boolean).join(" ") || m.emailAddress}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Follow-up date">
                <input
                  type="datetime-local"
                  className={inputClass}
                  disabled={!isEditor}
                  defaultValue={toLocalInput(o.followUpAt)}
                  onBlur={(e) => {
                    const v = e.target.value ? new Date(e.target.value) : null;
                    if ((v?.getTime() ?? null) !== (o.followUpAt?.getTime() ?? null)) update.mutate({ id: o.id, followUpAt: v });
                  }}
                />
              </Field>
              <Field label="Estimated value" hint={o.currency ? `In ${o.currency}` : undefined}>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  disabled={!isEditor}
                  defaultValue={o.estimatedValue ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    if (v !== o.estimatedValue) update.mutate({ id: o.id, estimatedValue: v });
                  }}
                />
              </Field>
              {(o.status === "submitted" || o.status === "under_evaluation" || o.status === "awarded" || o.submissionReference) && (
                <Field label="Submission confirmation / reference" hint={o.submittedAt ? `Submitted ${formatDate(o.submittedAt, true)}` : undefined}>
                  <input
                    className={inputClass}
                    disabled={!isEditor}
                    defaultValue={o.submissionReference ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== o.submissionReference) update.mutate({ id: o.id, submissionReference: v });
                    }}
                  />
                </Field>
              )}
              <Field label="Notes">
                <textarea
                  rows={4}
                  className={`${inputClass} h-auto py-2`}
                  disabled={!isEditor}
                  defaultValue={o.notes ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value || null;
                    if (v !== o.notes) update.mutate({ id: o.id, notes: v });
                  }}
                />
              </Field>
            </div>
          </Section>

          <Tasks opportunityId={o.id} tasks={o.tasks} editable={isEditor} />
        </div>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  );
}

const REQ_TONE = {
  meets: "text-emerald-600 dark:text-emerald-400",
  does_not_meet: "text-rose-600 dark:text-rose-400",
  unknown: "text-amber-600 dark:text-amber-400",
};
const REQ_LABEL = { meets: "Meets", does_not_meet: "Doesn't meet", unknown: "Unknown" };

function QualificationView({ q }: { q: StoredQualification }) {
  const groups = (["mandatory", "desirable"] as const).map((t) => [t, q.requirements.filter((r) => r.type === t)] as const);
  return (
    <div className="space-y-5 text-sm">
      <div>
        <p className="leading-relaxed">{q.summary}</p>
        <p className="mt-2 leading-relaxed text-muted-foreground">{q.reasoning}</p>
        {q.guardRailNotes?.length ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Adjusted by safety rules: {q.guardRailNotes.join(" ")}</p>
        ) : null}
      </div>

      {groups.map(([type, reqs]) =>
        reqs.length ? (
          <div key={type}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {type === "mandatory" ? "Mandatory requirements" : "Desirable (not required)"}
            </p>
            <ul className="divide-y rounded-lg border">
              {reqs.map((r, i) => (
                <li key={i} className="flex gap-3 px-3 py-2">
                  <span className={cn("w-24 shrink-0 text-xs font-medium", REQ_TONE[r.status])}>{REQ_LABEL[r.status]}</span>
                  <div className="min-w-0">
                    <p>{r.requirement}</p>
                    {r.evidence && <p className="mt-0.5 text-xs text-muted-foreground">{r.evidence}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Fact label="Services match" value={q.servicesMatch} />
        <Fact label="Can apply independently" value={q.canApplyIndependently} />
        <Fact label="Government experience required" value={q.governmentExperienceRequired} />
        <Fact label="Teaming / subcontracting" value={q.teamingSuggested ? "Worth considering" : "Not needed"} />
        <Fact label="Certifications" value={q.certificationsRelevant || "–"} />
        <Fact label="Geographic restriction" value={q.geographicRestriction ?? "None found"} />
        <Fact label="Insurance" value={q.insuranceRequirements ?? "None found"} />
        <Fact label="Financial requirements" value={q.financialRequirements ?? "None found"} />
        <Fact label="Contract vehicle" value={q.contractVehicleRequired ?? "None required"} />
      </dl>

      {q.missingInformation.length > 0 && (
        <div className="rounded-lg bg-amber-500/10 p-3">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">To confirm before deciding</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-900 dark:text-amber-100">
            {q.missingInformation.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Tasks({
  opportunityId,
  tasks,
  editable,
}: {
  opportunityId: string;
  tasks: { id: string; title: string; done: boolean; dueAt: Date | null }[];
  editable: boolean;
}) {
  const utils = api.useUtils();
  const [title, setTitle] = React.useState("");
  const [due, setDue] = React.useState("");
  const done = () => void utils.procurement.opportunity.invalidate({ id: opportunityId });
  const add = api.procurement.addTask.useMutation({
    onSuccess: () => {
      setTitle("");
      setDue("");
      done();
    },
    onError: (e) => toast.error(e.message),
  });
  const toggle = api.procurement.toggleTask.useMutation({ onSuccess: done });
  const remove = api.procurement.deleteTask.useMutation({ onSuccess: done });

  return (
    <Section title="Tasks">
      {tasks.length ? (
        <ul className="-my-1 mb-3 space-y-1">
          {tasks.map((t) => (
            <li key={t.id} className="group flex items-start gap-2 py-1 text-sm">
              <button disabled={!editable} onClick={() => toggle.mutate({ id: t.id, done: !t.done })} aria-label={t.done ? "Mark not done" : "Mark done"}>
                {t.done ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-500" /> : <Circle className="mt-0.5 size-4 text-muted-foreground" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn(t.done && "text-muted-foreground line-through")}>{t.title}</p>
                {t.dueAt && <p className="text-[11px] text-muted-foreground">Due {formatDate(t.dueAt)}</p>}
              </div>
              {editable && (
                <button onClick={() => remove.mutate({ id: t.id })} className="opacity-0 group-hover:opacity-100" aria-label="Delete task">
                  <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">No tasks yet.</p>
      )}
      {editable && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) add.mutate({ opportunityId, title, dueAt: due ? new Date(due) : null });
          }}
        >
          <input className={inputClass} placeholder="Add a task, e.g. Request insurance certificate" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex gap-2">
            <input type="date" className={inputClass} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
            <Button type="submit" size="sm" variant="outline" disabled={add.isPending || !title.trim()}>
              Add
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
}

function History({ logs }: { logs: { id: string; actor: "user" | "ai" | "system"; summary: string; createdAt: Date; action: string }[] }) {
  const Icon = { user: User, ai: Bot, system: Cog };
  return (
    <Section title="Activity history" description="Every change by a person, an agent or the scheduler.">
      {logs.length ? (
        <ol className="space-y-3">
          {logs.map((l) => {
            const I = Icon[l.actor];
            return (
              <li key={l.id} className="flex gap-3 text-sm">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                  {l.action === "opportunity.approval" ? <Lock className="size-3" /> : <I className="size-3" />}
                </span>
                <div className="min-w-0">
                  <p>{l.summary}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {l.actor === "ai" ? "AI agent" : l.actor === "system" ? "Scheduler" : "Team member"} · {formatDate(l.createdAt, true)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      )}
    </Section>
  );
}
