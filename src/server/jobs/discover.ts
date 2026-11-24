import "server-only";
import type { PrismaClient } from "@prisma/client";
import { isAiConfigured } from "@/server/ai/provider";
import { searchProvider, searchWeb } from "@/server/leads/web-search";
import { safeFetch } from "@/server/leads/crawler";
import { sendPush } from "@/server/tasks/notifications";
import { fromAdzuna, fromRemotive, fromUsajobs, isPostingUrl, normalizeJobUrl, titleRelevance, type Found } from "@/lib/jobs/sources";
import { postingFromApi } from "./fetch-posting";
import { scoreMatch } from "./ai";

/**
 * Job discovery: finds openings for your target roles and locations, scores
 * the most relevant against your CV, and parks them in "Discover" until you
 * save or dismiss them. Nothing is applied to.
 *
 * Sources
 * - Company job boards (Greenhouse, Lever, Ashby) found via your web search
 *   key (Tavily / Serper / Brave), read through their public APIs.
 * - Remotive (remote jobs): no key; at most 2 calls per run and only in the
 *   daily run, per Remotive's terms (≤4/day, credit Remotive, link back).
 * - Adzuna: ADZUNA_APP_ID + ADZUNA_APP_KEY (ADZUNA_COUNTRY, default "us").
 * - USAJOBS: USAJOBS_API_KEY + USAJOBS_EMAIL (the email you registered with).
 */

const BOARD_SITES = ["boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com"];
const MAX_NEW = 25;
const MAX_SCORED = 6;

export const discoverySources = () => ({
  boards: !!searchProvider(),
  remotive: true,
  adzuna: !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
  usajobs: !!(process.env.USAJOBS_API_KEY && process.env.USAJOBS_EMAIL),
});

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return res.json() as Promise<unknown>;
}

async function fromBoards(roles: string[], place: string): Promise<Found[]> {
  const hits = (await Promise.all(roles.slice(0, 2).map((r) => searchWeb(`"${r}" ${place}`.trim(), 10, BOARD_SITES).catch(() => [])))).flat();
  const urls = [...new Set(hits.map((h) => normalizeJobUrl(h.url)).filter(isPostingUrl))].slice(0, 8);
  const out = await Promise.all(
    urls.map(async (url): Promise<Found | null> => {
      const p = await postingFromApi(url).catch(() => null);
      if (!p?.title) return null;
      const company = p.company ?? new URL(url).pathname.split("/").filter(Boolean)[0]?.replace(/[-_]/g, " ") ?? "Unknown company";
      return { url, source: p.source ?? "Job board", title: p.title, company, location: p.location, workMode: p.workMode, salary: p.salary, description: p.description, postedAt: null, closesAt: null };
    }),
  );
  return out.filter((x): x is Found => !!x);
}

export type RunResult = { found: number; added: number; scored: number; errors: string[]; skipped?: string };

export async function runJobDiscovery(db: PrismaClient, userId: string, opts: { scheduled: boolean; remotive: { left: number }; deadline: number }): Promise<RunResult> {
  const profile = await db.jobProfile.findUnique({ where: { userId } });
  if (!profile?.targetRoles.length) return { found: 0, added: 0, scored: 0, errors: [], skipped: "Add your target roles first (My CV)." };
  const roles = profile.targetRoles.slice(0, 3);
  const place = profile.remoteOnly ? "remote" : (profile.locations[0] ?? "");
  const remoteFriendly = profile.remoteOnly || !profile.locations.length || profile.locations.some((l) => /remote|anywhere/i.test(l));
  const src = discoverySources();
  const errors: string[] = [];
  const tasks: Promise<Found[]>[] = [];

  if (src.boards) tasks.push(fromBoards(roles, place));
  if (opts.scheduled && remoteFriendly && opts.remotive.left > 0) {
    opts.remotive.left--;
    tasks.push(getJson(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(roles[0]!)}&limit=40`).then((j) => fromRemotive(j as Parameters<typeof fromRemotive>[0])));
  }
  if (src.adzuna) {
    const country = (process.env.ADZUNA_COUNTRY ?? "us").toLowerCase();
    for (const r of roles.slice(0, 2)) {
      const qs = new URLSearchParams({ app_id: process.env.ADZUNA_APP_ID!, app_key: process.env.ADZUNA_APP_KEY!, what: profile.remoteOnly ? `${r} remote` : r, results_per_page: "20", max_days_old: "14", "content-type": "application/json" });
      if (!profile.remoteOnly && profile.locations[0]) qs.set("where", profile.locations[0]);
      tasks.push(getJson(`https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(country)}/search/1?${qs}`).then((j) => fromAdzuna(j as Parameters<typeof fromAdzuna>[0])));
    }
  }
  if (src.usajobs) {
    const qs = new URLSearchParams({ Keyword: roles[0]!, ResultsPerPage: "25", DatePosted: "14" });
    if (profile.remoteOnly) qs.set("RemoteIndicator", "True");
    else if (profile.locations[0]) qs.set("LocationName", profile.locations[0]);
    tasks.push(
      getJson(`https://data.usajobs.gov/api/search?${qs}`, { Host: "data.usajobs.gov", "User-Agent": process.env.USAJOBS_EMAIL!, "Authorization-Key": process.env.USAJOBS_API_KEY! }).then((j) => fromUsajobs(j as Parameters<typeof fromUsajobs>[0])),
    );
  }

  const settled = await Promise.allSettled(tasks);
  const found = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : (errors.push(String((s.reason as Error)?.message ?? s.reason).slice(0, 120)), [])));

  // Keep fresh, relevant, new ones.
  const monthAgo = Date.now() - 30 * 86400_000;
  const [known, applied] = await Promise.all([
    db.jobDiscovery.findMany({ where: { userId }, select: { url: true } }),
    db.jobApplication.findMany({ where: { userId, url: { not: null } }, select: { url: true } }),
  ]);
  const seen = new Set([...known.map((k) => k.url), ...applied.map((a) => normalizeJobUrl(a.url!))]);
  const fresh = found
    .map((f) => ({ ...f, url: normalizeJobUrl(f.url), rel: titleRelevance(f.title, profile.targetRoles) }))
    .filter((f) => f.url.startsWith("http") && f.title && f.rel >= 0.34)
    .filter((f) => !f.postedAt || f.postedAt.getTime() >= monthAgo)
    .filter((f) => !f.closesAt || f.closesAt.getTime() > Date.now())
    .filter((f) => !profile.remoteOnly || f.workMode === "Remote" || /remote/i.test(f.location ?? ""))
    .filter((f) => (seen.has(f.url) ? false : (seen.add(f.url), true)))
    .sort((a, b) => b.rel - a.rel || (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0))
    .slice(0, MAX_NEW);

  const { count: added } = await db.jobDiscovery.createMany({
    data: fresh.map(({ rel: _r, ...f }) => ({
      userId,
      url: f.url.slice(0, 1000),
      source: f.source.slice(0, 60),
      title: f.title.slice(0, 200),
      company: f.company.slice(0, 160),
      location: f.location,
      workMode: f.workMode,
      salary: f.salary,
      description: f.description,
      postedAt: f.postedAt,
      closesAt: f.closesAt,
    })),
    skipDuplicates: true,
  });

  // Score the most relevant new ones against the CV while time allows.
  let scored = 0;
  if (isAiConfigured() && profile.resumeText.trim().length >= 200 && fresh.length) {
    const rows = await db.jobDiscovery.findMany({ where: { userId, url: { in: fresh.slice(0, MAX_SCORED).map((f) => f.url) }, matchScore: null }, select: { id: true, title: true, company: true, location: true, description: true } });
    await Promise.all(
      rows
        .filter((r) => (r.description?.length ?? 0) >= 150)
        .map(async (r) => {
          if (Date.now() > opts.deadline - 8000) return;
          try {
            const m = await scoreMatch(profile.resumeText, r);
            await db.jobDiscovery.update({ where: { id: r.id }, data: { matchScore: m.score, matchSummary: m.summary, keywordsMatched: m.matched, keywordsMissing: m.missing } });
            scored++;
          } catch {
            /* scored on demand later */
          }
        }),
    );
  }
  await db.jobProfile.update({ where: { userId }, data: { lastDiscoveredAt: new Date() } });
  return { found: found.length, added, scored, errors };
}

/** Daily run for everyone who has it switched on (called from the daily cron). */
export async function discoverForAll(db: PrismaClient, deadline: number) {
  const dueBefore = new Date(Date.now() - 20 * 3600_000);
  const profiles = await db.jobProfile.findMany({
    where: { discoverEnabled: true, targetRoles: { isEmpty: false }, OR: [{ lastDiscoveredAt: null }, { lastDiscoveredAt: { lt: dueBefore } }] },
    orderBy: { lastDiscoveredAt: { sort: "asc", nulls: "first" } },
    take: 20,
    select: { userId: true },
  });
  const remotive = { left: 2 };
  const results: { userId: string; added: number; scored: number }[] = [];
  for (const { userId } of profiles) {
    if (Date.now() > deadline - 20_000) break;
    const r = await runJobDiscovery(db, userId, { scheduled: true, remotive, deadline }).catch(() => null);
    if (!r) continue;
    results.push({ userId, added: r.added, scored: r.scored });
    if (r.added) {
      const strong = await db.jobDiscovery.count({ where: { userId, status: "new", matchScore: { gte: 70 }, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
      await sendPush(db, userId, {
        title: strong ? `${strong} strong job ${strong === 1 ? "match" : "matches"}` : `${r.added} new ${r.added === 1 ? "job" : "jobs"} found`,
        body: strong ? "New openings that fit your CV are waiting in Jobs → Discover." : "Review them in Jobs → Discover.",
        url: "/jobs?view=discover",
        tag: "job-discovery",
      }).catch(() => null);
    }
  }
  // Tidy: forget unsaved finds after 45 days.
  await db.jobDiscovery.deleteMany({ where: { status: { in: ["new", "dismissed"] }, createdAt: { lt: new Date(Date.now() - 45 * 86400_000) } } });
  return results;
}
