"use client";
import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarPlus, ChevronDown, Copy, Download, ExternalLink, FileText, Loader2, Mail, MessageSquareText, Printer, ScrollText, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { markdownToHtml } from "@/lib/jobs/markdown";
import { STAGES, type DocKind, type Job, type JobDoc, type JobsStore } from "./store";
import { CompanyMark, MatchRing, Stars, daysAgo } from "./jobs-app";

const field = "w-full rounded-xl bg-background px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-foreground/30";
const chipBtn = "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium ring-1 ring-border hover:bg-muted disabled:opacity-50";

const localDate = (n = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const toInput = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

const DOCS: { kind: DocKind; label: string; icon: React.ElementType }[] = [
  { kind: "resume", label: "Tailor my CV", icon: Wand2 },
  { kind: "cover_letter", label: "Cover letter", icon: ScrollText },
  { kind: "prep", label: "Interview prep", icon: MessageSquareText },
  { kind: "follow_up", label: "Follow-up email", icon: Mail },
];

export function JobSheet({ store, job, onClose, onNeedCv }: { store: JobsStore; job: Job | null; onClose: () => void; onNeedCv: () => void }) {
  const detail = store.useJob(job?.id ?? null);
  const hasCv = !!store.data?.profile?.hasCv;
  const [scoring, setScoring] = React.useState(false);
  const [writing, setWriting] = React.useState<DocKind | null>(null);
  const [instructions, setInstructions] = React.useState("");
  const [openDoc, setOpenDoc] = React.useState<JobDoc | null>(null);
  const [notes, setNotes] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [showDesc, setShowDesc] = React.useState(false);

  React.useEffect(() => {
    setNotes(job?.notes ?? "");
    setInstructions("");
    setShowDesc(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);
  React.useEffect(() => setDesc(detail?.description ?? ""), [detail?.id, detail?.description]);

  if (!job) return <Sheet open={false} />;
  const hasDesc = (detail?.description ?? "").length >= 150;

  async function score() {
    if (!job) return;
    if (!hasCv) return onNeedCv();
    setScoring(true);
    await store.score(job.id);
    setScoring(false);
  }
  async function write(kind: DocKind) {
    if (!job) return;
    if (!hasCv) return onNeedCv();
    setWriting(kind);
    const d = await store.generate(job.id, kind, instructions.trim() || undefined);
    setWriting(null);
    if (d) setOpenDoc(d);
  }

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
          <div className="border-b p-5">
            <div className="flex items-start gap-3">
              <CompanyMark job={job} size="lg" />
              <div className="min-w-0 flex-1">
                <SheetTitle className="font-tight text-xl font-bold leading-tight tracking-tight">{job.title}</SheetTitle>
                <SheetDescription className="truncate">{[job.company, job.location, job.workMode].filter(Boolean).join(" · ")}</SheetDescription>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                  <Stars value={job.excitement} onChange={(v) => store.update({ id: job.id, excitement: v })} size="md" />
                  {job.salary && <span>{job.salary}</span>}
                  {job.url && (
                    <a href={job.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-foreground">
                      <ExternalLink className="size-3.5" /> {job.source ?? "Posting"}
                    </a>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {STAGES.map((s) => (
                <button key={s.id} onClick={() => store.update({ id: job.id, stage: s.id })} className={cn("rounded-lg px-2 py-1 text-[11px] font-medium transition", job.stage === s.id ? s.tone : "text-muted-foreground hover:bg-muted")}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
              <label className="text-muted-foreground">
                Applied
                <input type="date" value={toInput(job.appliedAt)} onChange={(e) => store.update({ id: job.id, appliedAt: e.target.value ? new Date(`${e.target.value}T12:00:00`) : null })} className={cn(field, "mt-0.5 py-1.5 text-[12px]")} />
              </label>
              <label className="text-muted-foreground">
                Closes
                <input type="date" value={toInput(job.deadline)} onChange={(e) => store.update({ id: job.id, deadline: e.target.value ? new Date(`${e.target.value}T23:59:00`) : null })} className={cn(field, "mt-0.5 py-1.5 text-[12px]")} />
              </label>
            </div>
          </div>

          <section className="space-y-3 border-b p-5">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold">CV match</p>
              <button disabled={scoring || !hasDesc} onClick={score} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:text-violet-300 dark:hover:bg-violet-500/10" title={hasDesc ? undefined : "Add the job description first"}>
                {scoring ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {job.matchScore != null ? "Re-score" : "Score my CV"}
              </button>
            </div>
            {job.matchScore != null ? (
              <div className="rounded-2xl bg-muted/50 p-3.5">
                <div className="flex items-start gap-3">
                  <MatchRing score={job.matchScore} size={52} />
                  <p className="whitespace-pre-line text-[13px] leading-relaxed">{job.matchSummary}</p>
                </div>
                {(job.keywordsMatched.length > 0 || job.keywordsMissing.length > 0) && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex flex-wrap gap-1">
                      {job.keywordsMatched.map((k) => (
                        <span key={k} className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                          ✓ {k}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {job.keywordsMissing.map((k) => (
                        <span key={k} className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[11px] text-rose-800 dark:bg-rose-500/15 dark:text-rose-300">
                          {k}
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">Green keywords appear in your CV; red ones don&apos;t. Only add them if they&apos;re true for you.</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">{hasDesc ? "See how your CV fits this job and which keywords are missing." : "Add the job description below to score your CV against it."}</p>
            )}
          </section>

          <section className="space-y-2.5 border-b p-5">
            <p className="text-[13px] font-semibold">Application documents</p>
            <input value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={800} placeholder="Optional: anything to emphasise, e.g. my payroll migration project" className={cn(field, "text-[13px]")} />
            <div className="grid grid-cols-2 gap-2">
              {DOCS.map(({ kind, label, icon: Icon }) => (
                <button key={kind} disabled={!!writing || !hasDesc} onClick={() => write(kind)} className={cn(chipBtn, "justify-center py-2")}>
                  {writing === kind ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />} {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Written from your CV only: no invented experience. Always read before sending.</p>
            {detail?.documents.length ? (
              <ul className="space-y-1">
                {detail.documents.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => setOpenDoc(d)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-muted">
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{d.title}</span>
                      <span className="text-[11px] text-muted-foreground">{daysAgo(d.updatedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="space-y-2.5 border-b p-5">
            <p className="text-[13px] font-semibold">Next step</p>
            <div className="flex gap-2">
              <input
                defaultValue={job.nextAction ?? ""}
                key={`na-${job.id}`}
                onBlur={(e) => e.target.value !== (job.nextAction ?? "") && store.update({ id: job.id, nextAction: e.target.value || null })}
                placeholder="e.g. Send portfolio to the recruiter"
                maxLength={300}
                className={cn(field, "text-[13px]")}
              />
              <input type="date" value={toInput(job.nextActionAt)} onChange={(e) => store.update({ id: job.id, nextActionAt: e.target.value ? new Date(`${e.target.value}T12:00:00`) : null })} className={cn(field, "w-40 text-[13px]")} aria-label="Next step date" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => store.addTask(job, job.nextAction || `Follow up: ${job.title} at ${job.company}`, job.nextActionAt ? toInput(job.nextActionAt) : localDate(3))}
                className={chipBtn}
              >
                <CalendarPlus className="size-3.5" /> Add to Tasks
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input defaultValue={job.contactName ?? ""} key={`cn-${job.id}`} onBlur={(e) => e.target.value !== (job.contactName ?? "") && store.update({ id: job.id, contactName: e.target.value || null })} placeholder="Recruiter / contact" maxLength={160} className={cn(field, "text-[13px]")} />
              <input
                defaultValue={job.contactEmail ?? ""}
                key={`ce-${job.id}`}
                type="email"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v === (job.contactEmail ?? "")) return;
                  if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return toast.error("That email doesn't look right.");
                  store.update({ id: job.id, contactEmail: v || null });
                }}
                placeholder="Contact email"
                maxLength={254}
                className={cn(field, "text-[13px]")}
              />
            </div>
            {detail?.threads.length ? (
              <div className="space-y-1">
                <p className="text-[12px] font-medium text-muted-foreground">Emails</p>
                {detail.threads.map((t) => (
                  <Link key={t.id} href={`/mail?thread=${t.id}&account=${t.accountId}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-muted">
                    <Mail className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{t.subject}</span>
                    <span className="text-[11px] text-muted-foreground">{daysAgo(t.lastMessageDate)}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-2 border-b p-5">
            <p className="text-[13px] font-semibold">Notes</p>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (job.notes ?? "") && store.update({ id: job.id, notes: notes || null })} rows={3} maxLength={20_000} placeholder="Interview notes, people you spoke to, questions…" className={cn(field, "text-[13px]")} />
            <button onClick={() => setShowDesc((s) => !s)} className="flex items-center gap-1 text-[13px] font-semibold">
              Job description <ChevronDown className={cn("size-4 transition", showDesc && "rotate-180")} />
              {!hasDesc && <span className="ml-1 rounded bg-amber-100 px-1.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">needed for AI</span>}
            </button>
            {(showDesc || !hasDesc) && (
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                onBlur={() => desc !== (detail?.description ?? "") && store.update({ id: job.id, description: desc || null })}
                rows={10}
                maxLength={30_000}
                placeholder="Paste the full job description"
                className={cn(field, "font-mono text-[12px]")}
              />
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
                    {a.summary} <span className="text-muted-foreground">{daysAgo(a.createdAt)}</span>
                  </li>
                ))}
              </ol>
            )}
            <button
              onClick={() => {
                if (!confirm("Delete this application and its documents? This can't be undone.")) return;
                store.remove([job.id]);
                onClose();
              }}
              className="mt-6 inline-flex items-center gap-1.5 text-[12px] text-rose-600 hover:underline"
            >
              <Trash2 className="size-3.5" /> Delete application
            </button>
          </section>
        </SheetContent>
      </Sheet>
      <DocEditor store={store} doc={openDoc} onClose={() => setOpenDoc(null)} />
    </>
  );
}

function DocEditor({ store, doc, onClose }: { store: JobsStore; doc: JobDoc | null; onClose: () => void }) {
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [tab, setTab] = React.useState<"edit" | "preview">("preview");
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    setTitle(doc?.title ?? "");
    setContent(doc?.content ?? "");
    setTab("preview");
  }, [doc?.id, doc?.title, doc?.content]);
  if (!doc) return null;
  const dirty = title !== doc.title || content !== doc.content;
  const html = markdownToHtml(content);

  async function save() {
    if (!doc) return;
    setSaving(true);
    await store.saveDocument({ id: doc.id, title: title.trim() || doc.title, content }).catch(() => null);
    setSaving(false);
    toast.success("Saved");
  }
  function print() {
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) return toast.error("Allow pop-ups to print or save as PDF.");
    const safeTitle = title.replace(/[<>&"]/g, "");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>
      body{font:11pt/1.5 Georgia,'Times New Roman',serif;color:#111;max-width:720px;margin:40px auto;padding:0 32px}
      h1{font:700 22pt/1.2 system-ui,sans-serif;margin:0 0 4px}h2{font:700 12pt system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #ddd;padding-bottom:3px;margin:18px 0 8px}
      h3{font:600 11pt system-ui,sans-serif;margin:12px 0 2px}ul,ol{margin:4px 0 8px;padding-left:20px}li{margin:2px 0}p{margin:6px 0}a{color:#111}hr{border:0;border-top:1px solid #ddd}
      @page{margin:16mm}</style></head><body>${html}<script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
  }
  function download() {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\w\- ]+/g, "").trim() || "document"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && (dirty && !confirm("Discard your changes?") ? null : onClose())}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-3 rounded-3xl sm:max-w-3xl">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="w-full bg-transparent pr-8 font-tight text-xl font-bold tracking-tight outline-none" aria-label="Title" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-muted p-0.5 text-xs font-medium">
            {(["preview", "edit"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cn("rounded-lg px-3 py-1.5 capitalize", tab === t ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground")}>
                {t}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <button onClick={() => navigator.clipboard.writeText(content).then(() => toast.success("Copied"))} className={chipBtn}>
            <Copy className="size-3.5" /> Copy
          </button>
          <button onClick={download} className={chipBtn}>
            <Download className="size-3.5" /> .md
          </button>
          <button onClick={print} className={chipBtn}>
            <Printer className="size-3.5" /> Print / PDF
          </button>
          <button
            onClick={() => {
              if (!confirm("Delete this document?")) return;
              store.deleteDocument(doc.id);
              onClose();
            }}
            className={cn(chipBtn, "text-rose-600")}
            aria-label="Delete document"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        {tab === "edit" ? (
          <textarea value={content} onChange={(e) => setContent(e.target.value)} className={cn(field, "min-h-[50vh] flex-1 font-mono text-[12.5px] leading-relaxed")} />
        ) : (
          <div
            className="min-h-[50vh] flex-1 overflow-y-auto rounded-2xl bg-white p-6 text-[13.5px] leading-relaxed text-neutral-900 ring-1 ring-border [&_a]:underline [&_h1]:mb-1 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:border-b [&_h2]:pb-1 [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:uppercase [&_h2]:tracking-wider [&_h3]:mt-3 [&_h3]:font-semibold [&_hr]:my-3 [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
            // Safe: markdownToHtml escapes all input and only allows http(s)/mailto links.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={chipBtn}>
            Close
          </button>
          <button disabled={!dirty || saving} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-[13px] font-semibold text-background hover:opacity-90 disabled:opacity-50">
            {saving && <Loader2 className="size-4 animate-spin" />} Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
