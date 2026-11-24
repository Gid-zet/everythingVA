"use client";
import React from "react";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import { Check, ExternalLink, Globe, KeyRound, Loader2, MailCheck, Search, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeadsStore, Prospect, WebCompany } from "./store";

const field = "w-full rounded-xl bg-background px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-foreground/30";
const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2 text-[13px] font-semibold text-background hover:opacity-90 disabled:opacity-50";
const BATCH = 4;
const FIRST_PASS = 16;

const fitTone = (f: Prospect["fit"]) =>
  f === "strong" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : f === "possible" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";

/** contact key: `${domain}|${index}` */
type Picked = Set<string>;

export function WebProspector({ store, onNeedProfile }: { store: LeadsStore; onNeedProfile: () => void }) {
  const status = store.useWebStatus();
  const profile = store.data?.profile;
  const icpReady = !!(profile?.offer.trim() && profile.idealCustomer.trim());
  const reduce = useReducedMotion();

  const [brief, setBrief] = React.useState("");
  const [queries, setQueries] = React.useState<string[]>([]);
  const [suggesting, setSuggesting] = React.useState(false);
  const [companies, setCompanies] = React.useState<WebCompany[] | null>(null);
  const [cursor, setCursor] = React.useState(0);
  const [phase, setPhase] = React.useState<"idle" | "searching" | "researching">("idle");
  const [prospects, setProspects] = React.useState<Prospect[]>([]);
  const [skipped, setSkipped] = React.useState<{ domain: string; why: string }[]>([]);
  const [picked, setPicked] = React.useState<Picked>(new Set());
  const [adding, setAdding] = React.useState(false);
  const stop = React.useRef(false);

  if (!status) return <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" />;

  if (!status.provider)
    return (
      <div className="rounded-2xl bg-muted/50 p-5">
        <p className="flex items-center gap-2 text-[14px] font-semibold">
          <KeyRound className="size-4" /> Connect a search API to find companies on the web
        </p>
        <p className="mt-1.5 text-[13px] text-muted-foreground">Add one of these in Vercel → Settings → Environment Variables, then redeploy:</p>
        <ul className="mt-2 space-y-1 text-[13px]">
          <li>
            <code className="rounded bg-background px-1.5 py-0.5">SERPER_API_KEY</code> from serper.dev (Google results)
          </li>
          <li>
            <code className="rounded bg-background px-1.5 py-0.5">BRAVE_SEARCH_API_KEY</code> from brave.com/search/api (independent index)
          </li>
          <li>
            <code className="rounded bg-background px-1.5 py-0.5">TAVILY_API_KEY</code> from tavily.com (1,000 free searches a month, no card)
          </li>
          <li className="text-muted-foreground">
            Optional: <code className="rounded bg-background px-1.5 py-0.5">HUNTER_API_KEY</code> finds published work emails when a site lists none.
          </li>
        </ul>
      </div>
    );

  if (!icpReady)
    return (
      <div className="rounded-2xl border border-dashed p-6 text-center">
        <p className="text-[13px] text-muted-foreground">Web search starts from your ideal customer: what you sell and who buys it.</p>
        <button onClick={onNeedProfile} className={cn(primary, "mt-4")}>
          Describe your ideal customer
        </button>
      </div>
    );

  async function suggest() {
    setSuggesting(true);
    try {
      setQueries(await store.suggestSearches(brief));
    } catch {
      /* toast shown */
    } finally {
      setSuggesting(false);
    }
  }

  async function research(list: WebCompany[], from: number, count: number) {
    setPhase("researching");
    stop.current = false;
    let i = from;
    const end = Math.min(list.length, from + count);
    while (i < end && !stop.current) {
      const batch = list.slice(i, Math.min(end, i + BATCH)).map((c) => c.domain);
      try {
        const results = await store.researchCompanies(batch);
        const found = results.flatMap((r) => (r.prospect ? [r.prospect] : []));
        setProspects((p) => [...p, ...found].sort((a, b) => b.score - a.score));
        setSkipped((s) => [...s, ...results.filter((r) => !r.prospect).map((r) => ({ domain: r.domain, why: r.skipped ?? "Skipped" }))]);
        // Preselect people with an email at strong or possible fits.
        setPicked((s) => {
          const n = new Set(s);
          for (const p of found) if (p.fit !== "poor") p.contacts.forEach((c, k) => c.email && n.add(`${p.domain}|${k}`));
          return n;
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Research failed");
        break;
      }
      i += BATCH;
      setCursor(i);
    }
    setPhase("idle");
  }

  async function search() {
    const qs = queries.map((q) => q.trim()).filter((q) => q.length > 1).slice(0, 6);
    if (!qs.length) return;
    setPhase("searching");
    setProspects([]);
    setSkipped([]);
    setPicked(new Set());
    setCursor(0);
    try {
      const list = await store.webSearch(qs);
      setCompanies(list);
      if (!list.length) {
        setPhase("idle");
        return toast("No new company websites found. Try different searches.");
      }
      await research(list, 0, FIRST_PASS);
    } catch {
      setPhase("idle");
    }
  }

  async function add() {
    const chosen = prospects
      .map((p) => ({ p, contacts: p.contacts.filter((_, k) => picked.has(`${p.domain}|${k}`)) }))
      .filter((x) => x.contacts.length);
    if (!chosen.length) return;
    setAdding(true);
    try {
      const r = await store.importProspects(
        chosen.map(({ p, contacts }) => ({
          domain: p.domain,
          url: p.url,
          company: p.company,
          summary: p.summary,
          industry: p.industry,
          location: p.location,
          sizeHint: p.sizeHint,
          phone: p.phone,
          linkedin: p.linkedin,
          score: p.score,
          fit: p.fit,
          reason: p.reason,
          nextStep: p.nextStep,
          contacts: contacts.map((c) => ({ name: c.name, title: c.title, email: c.email })),
        })),
      );
      toast.success(`Added ${r.created} ${r.created === 1 ? "lead" : "leads"}`);
      const done = new Set(chosen.map((c) => c.p.domain));
      setProspects((ps) => ps.filter((p) => !done.has(p.domain)));
      setPicked(new Set());
    } catch {
      /* toast shown */
    } finally {
      setAdding(false);
    }
  }

  const busy = phase !== "idle";
  const total = companies?.length ?? 0;
  const pickedCount = picked.size;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex gap-2">
          <input value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={500} placeholder="Optional focus, e.g. construction firms in Texas with 50–500 staff" className={field} onKeyDown={(e) => e.key === "Enter" && suggest()} />
          <button disabled={suggesting || busy} onClick={suggest} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium ring-1 ring-border hover:bg-muted disabled:opacity-50">
            {suggesting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4 text-violet-500" />} Suggest searches
          </button>
        </div>
        {queries.length > 0 && (
          <div className="space-y-1.5">
            {queries.map((q, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Search className="size-3.5 shrink-0 text-muted-foreground" />
                <input value={q} onChange={(e) => setQueries((qs) => qs.map((x, j) => (j === i ? e.target.value : x)))} maxLength={200} className={cn(field, "py-1.5 text-[13px]")} />
                <button onClick={() => setQueries((qs) => qs.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Remove search">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {queries.length < 6 && (
              <button onClick={() => setQueries((qs) => [...qs, ""])} className="text-[12px] text-muted-foreground hover:text-foreground">
                + Add a search
              </button>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {status.remaining} of {status.limit} searches left today · reads public company sites only, honours robots.txt
          </span>
          {queries.length === 0 ? null : busy ? (
            <button onClick={() => (stop.current = true)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium ring-1 ring-border hover:bg-muted">
              <Loader2 className="size-4 animate-spin" /> Stop
            </button>
          ) : (
            <button disabled={!status.remaining} onClick={search} className={primary}>
              <Globe className="size-4" /> Search the web
            </button>
          )}
        </div>
      </div>

      {phase !== "idle" && (
        <div>
          <p className="mb-1 text-[12px] text-muted-foreground">{phase === "searching" ? "Searching…" : `Reading company websites… ${Math.min(cursor, total)} of ${Math.min(total, cursor < FIRST_PASS ? FIRST_PASS : total)}`}</p>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-500" animate={{ width: phase === "searching" ? "12%" : `${Math.max(12, (cursor / Math.max(1, Math.min(total, FIRST_PASS))) * 100)}%` }} />
          </div>
        </div>
      )}

      {prospects.length > 0 && (
        <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
          {prospects.map((p) => (
            <motion.div key={p.domain} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-3.5 ring-1 ring-border">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-[14px] font-semibold">
                    {p.company}
                    <a href={p.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-[11px] font-normal text-muted-foreground hover:text-foreground">
                      {p.domain} <ExternalLink className="size-3" />
                    </a>
                  </p>
                  <p className="text-[12px] text-muted-foreground">{[p.industry, p.location, p.sizeHint].filter(Boolean).join(" · ")}</p>
                </div>
                <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium", fitTone(p.fit))}>
                  <span className="tabular-nums">{p.score}</span> {p.fit === "strong" ? "Strong fit" : p.fit === "possible" ? "Possible" : "Poor fit"}
                </span>
              </div>
              <p className="mt-1.5 text-[12px]">{p.summary}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{p.reason}</p>
              <div className="mt-2 space-y-1">
                {p.contacts.length === 0 && <p className="text-[12px] text-muted-foreground">No contact details published. Add as a company lead from the site later.</p>}
                {p.contacts.map((c, k) => {
                  const key = `${p.domain}|${k}`;
                  const on = picked.has(key);
                  return (
                    <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-[12px] hover:bg-muted/60">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setPicked((s) => {
                            const n = new Set(s);
                            if (on) n.delete(key);
                            else n.add(key);
                            return n;
                          })
                        }
                        className="size-3.5 accent-foreground"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{c.name ?? "General contact"}</span>
                        {c.title && <span className="text-muted-foreground"> · {c.title}</span>}
                        {c.email ? <span className="text-muted-foreground"> · {c.email}</span> : <span className="text-muted-foreground"> · no email published</span>}
                      </span>
                      {c.email && p.emailDeliverable && <MailCheck className="size-3.5 shrink-0 text-emerald-600" aria-label="Domain accepts email" />}
                      {c.source === "hunter" && <span className="shrink-0 text-[10px] text-muted-foreground">Hunter</span>}
                    </label>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {skipped.length > 0 && (
        <details className="text-[12px] text-muted-foreground">
          <summary className="cursor-pointer">{skipped.length} sites skipped</summary>
          <ul className="mt-1 space-y-0.5">
            {skipped.map((s) => (
              <li key={s.domain}>
                {s.domain}: {s.why}
              </li>
            ))}
          </ul>
        </details>
      )}

      {(prospects.length > 0 || (companies && cursor < total)) && (
        <div className="flex items-center justify-between gap-2">
          {companies && cursor < total && !busy ? (
            <button onClick={() => research(companies, cursor, FIRST_PASS)} className="text-[12px] text-muted-foreground hover:text-foreground">
              Research {Math.min(FIRST_PASS, total - cursor)} more sites
            </button>
          ) : (
            <span />
          )}
          <button disabled={!pickedCount || adding} onClick={add} className={primary}>
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Add {pickedCount} {pickedCount === 1 ? "lead" : "leads"}
          </button>
        </div>
      )}
    </div>
  );
}
