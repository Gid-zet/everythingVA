"use client";
import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Check, Link2, Loader2, Mail, MailSearch, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { stageInfo, type InboxScan, type JobsStore, type Stage, type Suggestion } from "./store";
import { daysAgo } from "./jobs-app";

const field = "w-full rounded-xl bg-background px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-foreground/30";
const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2 text-[13px] font-semibold text-background hover:opacity-90 disabled:opacity-50";
const ghost = "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium ring-1 ring-border hover:bg-muted disabled:opacity-50";

function Shell({ open, onClose, title, desc, children, wide }: { open: boolean; onClose: () => void; title: string; desc: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto rounded-3xl", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <DialogTitle className="font-tight text-2xl font-bold tracking-[-0.03em]">{title}</DialogTitle>
        <DialogDescription>{desc}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}

const blank = { url: "", title: "", company: "", location: "", workMode: "", salary: "", description: "", deadline: "", companyDomain: "", source: "" };

export function AddJobDialog({ store, open, onClose, onCreated }: { store: JobsStore; open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = React.useState(blank);
  const [stage, setStage] = React.useState<Stage>("saved");
  const [fetching, setFetching] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setF(blank);
      setStage("saved");
      setNote(null);
    }
  }, [open]);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function fetchIt() {
    if (!/^https?:\/\//i.test(f.url.trim())) return toast.error("Paste the full link, starting with https://");
    setFetching(true);
    setNote(null);
    try {
      const r = await store.fetchPosting(f.url.trim());
      if (!r.ok) setNote(r.reason);
      else {
        const p = r.posting;
        setF((x) => ({
          ...x,
          title: p.title ?? x.title,
          company: p.company ?? x.company,
          location: p.location ?? x.location,
          workMode: p.workMode ?? x.workMode,
          salary: p.salary ?? x.salary,
          description: p.description ?? x.description,
          deadline: p.deadline ?? x.deadline,
          companyDomain: p.companyDomain ?? x.companyDomain,
          source: p.source ?? x.source,
        }));
        setNote(p.company ? null : "Read the posting. Add the company name.");
      }
    } catch {
      /* toast shown */
    } finally {
      setFetching(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const job = await store.create({
      title: f.title,
      company: f.company,
      url: f.url.trim() || null,
      location: f.location || null,
      workMode: f.workMode || null,
      salary: f.salary || null,
      description: f.description || null,
      companyDomain: f.companyDomain || null,
      source: f.source || null,
      deadline: f.deadline || null,
      stage,
    });
    setBusy(false);
    if (job) {
      onClose();
      onCreated(job.id);
    }
  }

  return (
    <Shell open={open} onClose={onClose} wide title="Add a job" desc="Paste a link to read the posting automatically, or fill it in yourself.">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={f.url} onChange={set("url")} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), fetchIt())} placeholder="https://boards.greenhouse.io/… or a careers page" className={cn(field, "pl-9")} autoFocus />
        </div>
        <button type="button" disabled={fetching || !f.url.trim()} onClick={fetchIt} className={ghost}>
          {fetching ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Read posting
        </button>
      </div>
      {note && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{note}</p>}
      <form onSubmit={save} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={f.title} onChange={set("title")} required maxLength={200} placeholder="Job title" className={field} />
          <input value={f.company} onChange={set("company")} required maxLength={160} placeholder="Company" className={field} />
          <input value={f.location} onChange={set("location")} maxLength={200} placeholder="Location" className={field} />
          <select value={f.workMode} onChange={set("workMode")} className={field} aria-label="Work mode">
            <option value="">Work mode</option>
            <option>Remote</option>
            <option>Hybrid</option>
            <option>On-site</option>
          </select>
          <input value={f.salary} onChange={set("salary")} maxLength={120} placeholder="Salary (optional)" className={field} />
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            Closes
            <input type="date" value={f.deadline} onChange={set("deadline")} className={field} />
          </label>
        </div>
        <textarea value={f.description} onChange={set("description")} rows={7} maxLength={30_000} placeholder="Job description (needed for match scores and tailoring)" className={cn(field, "text-[13px]")} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-xl bg-muted p-0.5 text-xs font-medium" role="group" aria-label="Stage">
            {(["saved", "applied"] as Stage[]).map((s) => (
              <button type="button" key={s} onClick={() => setStage(s)} className={cn("rounded-lg px-3 py-1.5", stage === s ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground")}>
                {s === "saved" ? "Save for later" : "Already applied"}
              </button>
            ))}
          </div>
          <button disabled={busy || !f.title.trim() || !f.company.trim()} className={primary}>
            {busy && <Loader2 className="size-4 animate-spin" />} Add job
          </button>
        </div>
      </form>
    </Shell>
  );
}

const splitList = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 15);

export function CvDialog({ store, open, onClose }: { store: JobsStore; open: boolean; onClose: () => void }) {
  const profile = store.useProfile(open);
  const [text, setText] = React.useState("");
  const [name, setName] = React.useState<string | null>(null);
  const [headline, setHeadline] = React.useState("");
  const [roles, setRoles] = React.useState("");
  const [locations, setLocations] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setText(profile?.resumeText ?? "");
    setName(profile?.resumeName ?? null);
    setHeadline(profile?.headline ?? "");
    setRoles(profile?.targetRoles.join(", ") ?? "");
    setLocations(profile?.locations.join(", ") ?? "");
  }, [open, profile]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/jobs/cv", { method: "POST", body });
      const json = (await res.json()) as { text?: string; name?: string; error?: string };
      if (!res.ok || !json.text) throw new Error(json.error ?? "Couldn't read that file.");
      setText(json.text);
      setName(json.name ?? file.name);
      toast.success("CV read. Check the text, then save.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await store.saveProfile({ resumeText: text, resumeName: name, headline: headline || null, targetRoles: splitList(roles), locations: splitList(locations) });
      toast.success("CV saved");
      onClose();
    } catch {
      /* toast shown */
    } finally {
      setBusy(false);
    }
  }
  const words = text.split(/\s+/).filter(Boolean).length;

  return (
    <Shell open={open} onClose={onClose} wide title="My CV" desc="Your master CV. AI only uses facts from here when scoring and tailoring.">
      <div className="flex flex-wrap items-center gap-2">
        <label className={cn(ghost, "cursor-pointer")}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload PDF or Word
          <input type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {name && <span className="truncate text-[12px] text-muted-foreground">{name}</span>}
        <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">{words} words</span>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} maxLength={60_000} placeholder="Or paste your CV here" className={cn(field, "font-mono text-[12px] leading-relaxed")} />
      <div className="grid gap-3 sm:grid-cols-3">
        <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={200} placeholder="Headline, e.g. HR Business Partner" className={field} />
        <input value={roles} onChange={(e) => setRoles(e.target.value)} placeholder="Target roles, e.g. HR Business Partner (used by Discover)" className={field} />
        <input value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Locations, e.g. Austin TX, Remote" className={field} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{words < 40 ? "Add at least a few paragraphs for useful results." : "Stored in your account only."}</span>
        <button disabled={busy || !text.trim()} onClick={save} className={primary}>
          {busy && <Loader2 className="size-4 animate-spin" />} Save CV
        </button>
      </div>
    </Shell>
  );
}

const KIND_LABEL: Record<string, string> = { received: "Application received", assessment: "Assessment", interview: "Interview", offer: "Offer", rejection: "Rejection" };

export function InboxDialog({ store, open, onClose, onOpenJob }: { store: JobsStore; open: boolean; onClose: () => void; onOpenJob: (id: string) => void }) {
  const [scan, setScan] = React.useState<InboxScan | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<Set<string>>(new Set());
  const active = (store.data?.jobs ?? []).filter((j) => ["applied", "screening", "interview", "offer"].includes(j.stage)).length;

  async function run() {
    setBusy(true);
    setDone(new Set());
    try {
      setScan(await store.scanInbox());
    } catch {
      /* toast shown */
    } finally {
      setBusy(false);
    }
  }
  const key = (s: Suggestion) => `${s.jobId}|${s.threadId}`;
  async function accept(s: Suggestion, stage: Stage | null) {
    await store.applySuggestion(s, stage).catch(() => null);
    setDone((d) => new Set(d).add(key(s)));
    toast.success(stage ? `Moved to ${stageInfo(stage).label}` : "Email linked");
  }

  return (
    <Shell open={open} onClose={onClose} wide title="Check inbox" desc="Finds recruiter emails about your active applications and suggests what changed. Nothing moves until you accept.">
      {!scan ? (
        <div className="rounded-2xl border border-dashed p-6 text-center">
          <MailSearch className="mx-auto size-6 text-muted-foreground/60" />
          <p className="mt-2 text-[13px] text-muted-foreground">
            {active ? `Looks at mail from the companies (and hiring systems like Greenhouse or Workday) for your ${active} active ${active === 1 ? "application" : "applications"}.` : "Mark a job as Applied first, then check for replies."}
          </p>
          <button disabled={busy || !active} onClick={run} className={cn(primary, "mt-4")}>
            {busy && <Loader2 className="size-4 animate-spin" />} Check my inbox
          </button>
        </div>
      ) : scan.suggestions.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-6 text-center text-[13px] text-muted-foreground">
          No new recruiter emails{scan.checked ? ` (checked ${scan.checked})` : ""}. Adding the company&apos;s email domain or a contact email to a job helps matching.
          <div className="mt-3">
            <button onClick={run} disabled={busy} className={ghost}>
              {busy && <Loader2 className="size-4 animate-spin" />} Check again
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {scan.suggestions.map((s) => {
            const isDone = done.has(key(s));
            return (
              <div key={key(s)} className={cn("rounded-2xl p-3.5 ring-1 ring-border transition", isDone && "opacity-50")}>
                <div className="flex items-start gap-2">
                  <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", s.kind === "rejection" ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" : s.kind === "offer" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300")}>
                    {KIND_LABEL[s.kind] ?? s.kind}
                  </span>
                  <button onClick={() => onOpenJob(s.jobId)} className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold hover:underline">
                    {s.jobTitle} · {s.company}
                  </button>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{daysAgo(s.sentAt)}</span>
                </div>
                <p className="mt-1 text-[13px]">{s.summary}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {s.from} · “{s.subject}”{s.eventDate ? ` · ${new Date(s.eventDate).toLocaleString()}` : ""}
                </p>
                {!isDone && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.suggestedStage && (
                      <button onClick={() => accept(s, s.suggestedStage)} className={cn(primary, "px-3 py-1.5 text-[12px]")}>
                        <Check className="size-3.5" /> Move to {stageInfo(s.suggestedStage).label}
                      </button>
                    )}
                    <button onClick={() => accept(s, null)} className={cn(ghost, "px-2.5 py-1.5 text-[12px]")}>
                      <Link2 className="size-3.5" /> Just link email
                    </button>
                    <Link href={`/mail?thread=${s.threadId}&account=${s.accountId}`} className={cn(ghost, "px-2.5 py-1.5 text-[12px]")}>
                      <Mail className="size-3.5" /> Open
                    </Link>
                    <button
                      onClick={() => {
                        store.dismissSuggestion(s);
                        setDone((d) => new Set(d).add(key(s)));
                      }}
                      className={cn(ghost, "px-2.5 py-1.5 text-[12px] text-muted-foreground")}
                    >
                      <X className="size-3.5" /> Not related
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
