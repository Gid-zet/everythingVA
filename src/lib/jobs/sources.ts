/**
 * Job discovery sources: turning each API's response into one shape (pure;
 * tested). Network calls live in src/server/jobs/discover.ts.
 */
import { htmlToText } from "../leads/web";

export type Found = {
  url: string;
  source: string;
  title: string;
  company: string;
  location: string | null;
  workMode: string | null;
  salary: string | null;
  description: string | null;
  postedAt: Date | null;
  closesAt: Date | null;
};

/** Same job, same key: drop tracking params, fragments and trailing slashes. */
export function normalizeJobUrl(url: string) {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|gh_src|source|ref|lever-|src$)/i.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.toLowerCase();
    return u.href.replace(/\/(\?|$)/, "$1");
  } catch {
    return url;
  }
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w.length > 1 && !["and", "of", "the", "for", "to", "in", "a"].includes(w));

/** 0–1: how much a job title overlaps the roles you're targeting (cheap pre-filter before AI). */
export function titleRelevance(title: string, roles: string[]) {
  if (!roles.length) return 0.5;
  const t = new Set(words(title));
  let best = 0;
  for (const r of roles) {
    const rw = words(r);
    if (!rw.length) continue;
    const hit = rw.filter((w) => t.has(w)).length / rw.length;
    best = Math.max(best, hit);
  }
  return best;
}

const date = (v: unknown) => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const clip = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : null);
const money = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

type RemotiveJob = { url: string; title: string; company_name: string; candidate_required_location?: string; salary?: string; description?: string; publication_date?: string };
export function fromRemotive(json: { jobs?: RemotiveJob[] }): Found[] {
  return (json.jobs ?? []).map((j) => ({
    url: j.url,
    source: "Remotive",
    title: j.title,
    company: j.company_name,
    location: clip(j.candidate_required_location, 200) || "Remote",
    workMode: "Remote",
    salary: clip(j.salary, 120),
    description: j.description ? htmlToText(j.description, 15_000) : null,
    postedAt: date(j.publication_date),
    closesAt: null,
  }));
}

type AdzunaJob = { redirect_url: string; title: string; company?: { display_name?: string }; location?: { display_name?: string }; description?: string; salary_min?: number; salary_max?: number; salary_is_predicted?: string | number; created?: string };
export function fromAdzuna(json: { results?: AdzunaJob[] }): Found[] {
  return (json.results ?? []).map((j) => {
    const predicted = String(j.salary_is_predicted ?? "0") === "1";
    const sal = !predicted && j.salary_min ? (j.salary_max && j.salary_max !== j.salary_min ? `${money(j.salary_min)}–${money(j.salary_max)}` : money(j.salary_min)) : null;
    return {
      url: j.redirect_url,
      source: "Adzuna",
      title: htmlToText(j.title, 200),
      company: j.company?.display_name ?? "Unknown company",
      location: clip(j.location?.display_name, 200),
      workMode: /remote/i.test(`${j.title} ${j.location?.display_name ?? ""}`) ? "Remote" : null,
      salary: sal,
      description: j.description ? htmlToText(j.description, 5000) : null,
      postedAt: date(j.created),
      closesAt: null,
    };
  });
}

type UsaItem = {
  MatchedObjectDescriptor: {
    PositionTitle: string;
    OrganizationName?: string;
    PositionLocationDisplay?: string;
    PositionURI: string;
    PositionRemuneration?: { MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string }[];
    QualificationSummary?: string;
    PublicationStartDate?: string;
    ApplicationCloseDate?: string;
    UserArea?: { Details?: { JobSummary?: string; MajorDuties?: string[] | string; TeleworkEligible?: boolean; RemoteIndicator?: boolean } };
  };
};
export function fromUsajobs(json: { SearchResult?: { SearchResultItems?: UsaItem[] } }): Found[] {
  return (json.SearchResult?.SearchResultItems ?? []).map(({ MatchedObjectDescriptor: d }) => {
    const pay = d.PositionRemuneration?.[0];
    const min = Number(pay?.MinimumRange);
    const max = Number(pay?.MaximumRange);
    const unit = pay?.RateIntervalCode === "PA" ? " per year" : pay?.RateIntervalCode === "PH" ? " per hour" : "";
    const duties = Array.isArray(d.UserArea?.Details?.MajorDuties) ? d.UserArea!.Details!.MajorDuties.join("\n") : (d.UserArea?.Details?.MajorDuties ?? "");
    return {
      url: d.PositionURI,
      source: "USAJOBS",
      title: d.PositionTitle,
      company: d.OrganizationName ?? "US Government",
      location: clip(d.PositionLocationDisplay, 200),
      workMode: d.UserArea?.Details?.RemoteIndicator ? "Remote" : d.UserArea?.Details?.TeleworkEligible ? "Hybrid" : null,
      salary: min ? `USD ${money(min)}${max && max !== min ? `–${money(max)}` : ""}${unit}` : null,
      description: [d.UserArea?.Details?.JobSummary, duties, d.QualificationSummary].filter(Boolean).join("\n\n").slice(0, 15_000) || null,
      postedAt: date(d.PublicationStartDate),
      closesAt: date(d.ApplicationCloseDate),
    };
  });
}

type AshbyJob = { title: string; location?: string; isRemote?: boolean; workplaceType?: string; descriptionPlain?: string; publishedAt?: string; jobUrl: string; isListed?: boolean; compensation?: { compensationTierSummary?: string; scrapeableCompensationSalarySummary?: string } };
export function fromAshby(json: { jobs?: AshbyJob[] }, org: string): Found[] {
  return (json.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      url: j.jobUrl,
      source: "Ashby",
      title: j.title,
      company: org,
      location: clip(j.location, 200),
      workMode: j.isRemote || j.workplaceType === "Remote" ? "Remote" : j.workplaceType === "Hybrid" ? "Hybrid" : null,
      salary: clip(j.compensation?.scrapeableCompensationSalarySummary ?? j.compensation?.compensationTierSummary, 120),
      description: clip(j.descriptionPlain, 15_000),
      postedAt: date(j.publishedAt),
      closesAt: null,
    }));
}

/** jobs.ashbyhq.com/{org}/{id} → { org, id } */
export function ashbyParts(url: string) {
  try {
    const u = new URL(url);
    if (!/(^|\.)ashbyhq\.com$/.test(u.hostname)) return null;
    const [org, id] = u.pathname.split("/").filter(Boolean);
    return org && id ? { org: decodeURIComponent(org), id } : null;
  } catch {
    return null;
  }
}

/** Is this search hit a single job posting on a board we can read via API? */
export function isPostingUrl(url: string) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (/(^|\.)greenhouse\.io$/.test(u.hostname)) return parts.includes("jobs") && /^\d+$/.test(parts[parts.indexOf("jobs") + 1] ?? "");
    if (/(^|\.)lever\.co$/.test(u.hostname)) return parts.length >= 2 && /^[0-9a-f-]{36}$/i.test(parts[1]!);
    if (/(^|\.)ashbyhq\.com$/.test(u.hostname)) return parts.length >= 2 && /^[0-9a-f-]{36}$/i.test(parts[1]!);
    return false;
  } catch {
    return false;
  }
}
