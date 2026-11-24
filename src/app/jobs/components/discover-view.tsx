"use client";
import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { Bookmark, ChevronDown, ExternalLink, Loader2, Radar, Settings2, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Discovery, JobsStore } from "./store";
import { CompanyMark, MatchRing, daysAgo } from "./jobs-app";

const chip = "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium ring-1 ring-border hover:bg-muted disabled:opacity-50";

const SOURCE_INFO: { key: "boards" | "remotive" | "adzuna" | "usajobs"; label: string; hint: string }[] = [
  { key: "boards", label: "Company job boards", hint: "Greenhouse, Lever, Ashby via your web search key (TAVILY_API_KEY)" },
  { key: "remotive", label: "Remotive", hint: "Remote jobs, daily (no key needed)" },
  { key: "adzuna", label: "Adzuna", hint: "ADZUNA_APP_ID + ADZUNA_APP_KEY" },
  { key: "usajobs", label: "USAJOBS", hint: "USAJOBS_API_KEY + USAJOBS_EMAIL" },
];

export function DiscoverView({ store, onSaved, onEditCv }: { store: JobsStore; onSaved: (id: string) => void; onEditCv: () => void }) {
  const items = store.data?.discoveries ?? [];
  const profile = store.data?.profile ?? null;
  const sources = store.data?.sources;
  const [running, setRunning] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [minScore, setMinScore] = React.useState(0);
  const reduce = useReducedMotion();
  const roles = profile?.targetRoles ?? [];

  async function run() {
    setRunning(true);
    const r = await store.discoverNow();
    setRunning(false);
    if (!r) return;
    if (r.skipped) return toast(r.skipped);
    toast.success(r.added ? `Found ${r.added} new ${r.added === 1 ? "job" : "jobs"}${r.scored ? `, scored ${r.scored}` : ""}` : "No new matching jobs right now. Try again tomorrow or widen your roles.");
  }

  const shown = items.filter((d) => (d.matchScore ?? 0) >= minScore || (minScore === 0 && d.matchScore == null));

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white">
            <Radar className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold">{roles.length ? `Looking for ${roles.join(", ")}` : "Tell Discover what you're looking for"}</p>
            <p className="text-[12px] text-muted-foreground">
              {roles.length
                ? `${profile?.remoteOnly ? "Remote only" : profile?.locations.length ? profile.locations.join(", ") : "Any location"} · ${profile?.discoverEnabled ? "checks daily" : "daily checks off"}${profile?.lastDiscoveredAt ? ` · last run ${daysAgo(profile.lastDiscoveredAt)}` : ""}`
                : "Add target roles and locations to your CV profile, then Discover searches every day."}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => setShowSettings((s) => !s)} className={chip} aria-expanded={showSettings}>
              <Settings2 className="size-3.5" /> Settings <ChevronDown className={cn("size-3.5 transition", showSettings && "rotate-180")} />
            </button>
            {roles.length ? (
              <button disabled={running || !profile?.runsLeft} onClick={run} className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-3.5 py-2 text-[13px] font-semibold text-background hover:opacity-90 disabled:opacity-50">
                {running ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {running ? "Searching…" : "Find jobs now"}
              </button>
            ) : (
              <button onClick={onEditCv} className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-3.5 py-2 text-[13px] font-semibold text-background hover:opacity-90">
                Set target roles
              </button>
            )}
          </div>
        </div>
        {roles.length > 0 && <p className="mt-2 text-[11px] text-muted-foreground">{profile?.runsLeft ?? 0} manual searches left today · nothing is ever applied to automatically</p>}
        <AnimatePresence initial={false}>
          {showSettings && (
            <motion.div initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2">
                <div className="space-y-2 text-[13px]">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="size-4 accent-foreground" checked={!!profile?.discoverEnabled} onChange={(e) => store.saveDiscoverySettings({ discoverEnabled: e.target.checked, remoteOnly: !!profile?.remoteOnly })} />
                    Search every day and notify me about strong matches
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="size-4 accent-foreground" checked={!!profile?.remoteOnly} onChange={(e) => store.saveDiscoverySettings({ discoverEnabled: !!profile?.discoverEnabled, remoteOnly: e.target.checked })} />
                    Remote jobs only
                  </label>
                  <button onClick={onEditCv} className="text-[12px] text-muted-foreground underline hover:text-foreground">
                    Edit target roles and locations
                  </button>
                </div>
                <ul className="space-y-1 text-[12px]">
                  {SOURCE_INFO.map((s) => (
                    <li key={s.key} className="flex items-start gap-2">
                      <span className={cn("mt-1 size-2 shrink-0 rounded-full", sources?.[s.key] ? "bg-emerald-500" : "bg-neutral-300")} />
                      <span>
                        <span className="font-medium">{s.label}</span> <span className="text-muted-foreground">{sources?.[s.key] ? "· on" : `· add ${s.hint}`}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-muted-foreground">{items.length} waiting</span>
          {[0, 50, 70].map((n) => (
            <button key={n} onClick={() => setMinScore(n)} className={cn("rounded-lg px-2 py-1 font-medium ring-1 ring-border", minScore === n ? "bg-foreground text-background" : "bg-card")}>
              {n ? `${n}%+ match` : "All"}
            </button>
          ))}
          <span className="flex-1" />
          <button
            onClick={() => {
              const low = items.filter((d) => d.matchScore != null && d.matchScore < 50).map((d) => d.id);
              if (!low.length) return toast("No low matches to clear.");
              store.dismissDiscoveries(low);
              toast.success(`Dismissed ${low.length} low matches`);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            Dismiss matches under 50%
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-6 py-12 text-center">
          <Radar className="mx-auto size-6 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">No new openings waiting</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">New jobs for your target roles appear here every day, scored against your CV. Save the good ones to your pipeline.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {shown.map((d) => (
              <DiscoveryCard key={d.id} d={d} open={openId === d.id} onToggle={() => setOpenId(openId === d.id ? null : d.id)} store={store} onSaved={onSaved} />
            ))}
          </AnimatePresence>
          {shown.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nothing at this match level.</p>}
        </div>
      )}
      <p className="text-center text-[11px] text-muted-foreground">Listings from Remotive, Adzuna, USAJOBS and company job boards; each links to its original posting.</p>
    </div>
  );
}

function DiscoveryCard({ d, open, onToggle, store, onSaved }: { d: Discovery; open: boolean; onToggle: () => void; store: JobsStore; onSaved: (id: string) => void }) {
  const detail = store.useDiscovery(open ? d.id : null);
  const [busy, setBusy] = React.useState<"save" | "score" | null>(null);
  const reduce = useReducedMotion();
  return (
    <motion.div layout={reduce ? false : "position"} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="rounded-2xl bg-card ring-1 ring-border">
      <div className="flex items-start gap-3 p-3.5">
        <CompanyMark job={{ id: d.id, company: d.company }} />
        <button onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className="block text-[14px] font-semibold leading-snug">{d.title}</span>
          <span className="block truncate text-[12px] text-muted-foreground">{[d.company, d.location, d.workMode, d.salary].filter(Boolean).join(" · ")}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5">via {d.source}</span>
            {d.postedAt && <span>posted {daysAgo(d.postedAt)}</span>}
            {d.closesAt && <span>· closes {new Date(d.closesAt).toLocaleDateString()}</span>}
          </span>
          {d.matchSummary && !open && <span className="mt-1 line-clamp-2 block text-[12px] text-muted-foreground">{d.matchSummary.split("\n")[0]}</span>}
        </button>
        <MatchRing score={d.matchScore} size={38} />
      </div>
      {open && (
        <div className="space-y-2 border-t px-3.5 py-3">
          {d.matchSummary && <p className="whitespace-pre-line text-[12.5px]">{d.matchSummary}</p>}
          {(d.keywordsMatched.length > 0 || d.keywordsMissing.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {d.keywordsMatched.map((k) => (
                <span key={k} className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                  ✓ {k}
                </span>
              ))}
              {d.keywordsMissing.map((k) => (
                <span key={k} className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[11px] text-rose-800 dark:bg-rose-500/15 dark:text-rose-300">
                  {k}
                </span>
              ))}
            </div>
          )}
          {!detail ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : detail.description ? (
            <p className="max-h-60 overflow-y-auto whitespace-pre-line rounded-xl bg-muted/50 p-3 text-[12px] leading-relaxed">{detail.description}</p>
          ) : (
            <p className="text-[12px] text-muted-foreground">No description in this listing. Open the original posting to read it.</p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 border-t px-3.5 py-2">
        <button
          disabled={!!busy}
          onClick={async () => {
            setBusy("save");
            const j = await store.saveDiscovery(d.id);
            setBusy(null);
            if (j) {
              toast.success("Saved to your pipeline");
              onSaved(j.id);
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-2.5 py-1.5 text-[12px] font-semibold text-background hover:opacity-90 disabled:opacity-50"
        >
          {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <Bookmark className="size-3.5" />} Save
        </button>
        {d.matchScore == null && (
          <button
            disabled={!!busy}
            onClick={async () => {
              setBusy("score");
              await store.scoreDiscovery(d.id);
              setBusy(null);
            }}
            className={chip}
          >
            {busy === "score" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-violet-500" />} Score
          </button>
        )}
        <a href={d.url} target="_blank" rel="noreferrer noopener" className={chip}>
          <ExternalLink className="size-3.5" /> Open posting
        </a>
        <span className="flex-1" />
        <button onClick={() => store.dismissDiscoveries([d.id])} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-3.5" /> Not for me
        </button>
      </div>
    </motion.div>
  );
}
