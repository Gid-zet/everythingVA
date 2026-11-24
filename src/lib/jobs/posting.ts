/**
 * Job posting helpers (pure; tested). Most job pages publish a schema.org
 * JobPosting block for Google Jobs, and Greenhouse / Lever have public JSON
 * APIs, so a posting can usually be read without guessing from page layout.
 */
import { decodeEntities, htmlToText } from "../leads/web";

export type Posting = {
  title: string | null;
  company: string | null;
  companyDomain: string | null;
  location: string | null;
  workMode: string | null;
  salary: string | null;
  description: string | null;
  deadline: string | null;
  source: string | null;
};

const BOARDS: [RegExp, string][] = [
  [/(^|\.)greenhouse\.io$/, "Greenhouse"],
  [/(^|\.)lever\.co$/, "Lever"],
  [/(^|\.)ashbyhq\.com$/, "Ashby"],
  [/(^|\.)myworkdayjobs\.com$|(^|\.)workday\.com$/, "Workday"],
  [/(^|\.)smartrecruiters\.com$/, "SmartRecruiters"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)indeed\.[a-z.]+$/, "Indeed"],
  [/(^|\.)glassdoor\.[a-z.]+$/, "Glassdoor"],
  [/(^|\.)wellfound\.com$/, "Wellfound"],
  [/(^|\.)ziprecruiter\.com$/, "ZipRecruiter"],
  [/(^|\.)usajobs\.gov$/, "USAJOBS"],
];

export function boardOf(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return BOARDS.find(([re]) => re.test(host))?.[1] ?? host;
  } catch {
    return null;
  }
}

/** Public JSON endpoints for boards that offer them. */
export function apiUrlFor(url: string): { kind: "greenhouse" | "lever"; api: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    // boards.greenhouse.io/{board}/jobs/{id} or job-boards.greenhouse.io/{board}/jobs/{id}
    const i = parts.indexOf("jobs");
    const board = parts[0] === "embed" ? u.searchParams.get("for") : parts[0];
    const id = i > 0 ? parts[i + 1] : u.searchParams.get("token") ?? u.searchParams.get("gh_jid");
    if (board && id && /^\d+$/.test(id)) return { kind: "greenhouse", api: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${id}` };
  }
  if (/(^|\.)lever\.co$/.test(host) && parts.length >= 2 && /^[0-9a-f-]{36}$/i.test(parts[1]!)) {
    return { kind: "lever", api: `https://api.lever.co/v0/postings/${encodeURIComponent(parts[0]!)}/${parts[1]}` };
  }
  return null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? decodeEntities(v.trim()) : null);
const first = <T,>(v: T | T[] | undefined | null): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);

function salaryText(base: unknown): string | null {
  const b = first(base as Record<string, unknown> | Record<string, unknown>[]);
  if (!b || typeof b !== "object") return null;
  const cur = str(b.currency) ?? "";
  const val = b.value as Record<string, unknown> | number | undefined;
  if (typeof val === "number") return `${cur} ${val.toLocaleString("en-US")}`.trim();
  if (!val || typeof val !== "object") return null;
  const unit = str(val.unitText)?.toLowerCase();
  const fmt = (n: unknown) => (typeof n === "number" ? n.toLocaleString("en-US") : str(n));
  const min = fmt(val.minValue);
  const max = fmt(val.maxValue);
  const single = fmt(val.value);
  const range = min && max ? `${min}–${max}` : (single ?? min ?? max);
  if (!range) return null;
  return `${cur} ${range}${unit ? ` per ${unit}` : ""}`.trim();
}

function placeText(loc: unknown): string | null {
  const places = (Array.isArray(loc) ? loc : [loc]).filter(Boolean) as Record<string, unknown>[];
  const out = places
    .map((p) => {
      const a = (p.address ?? p) as Record<string, unknown>;
      if (typeof a === "string") return a;
      return [str(a.addressLocality), str(a.addressRegion), str(typeof a.addressCountry === "object" ? (a.addressCountry as Record<string, unknown>)?.name : a.addressCountry)].filter(Boolean).join(", ");
    })
    .filter(Boolean);
  return out.length ? [...new Set(out)].slice(0, 3).join(" · ") : null;
}

/** schema.org JobPosting from a page's JSON-LD, if present. */
export function parseJobPostingJsonLd(html: string): Posting | null {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]!.trim());
    } catch {
      continue;
    }
    const stack: unknown[] = [data];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node)) {
        stack.push(...node);
        continue;
      }
      const o = node as Record<string, unknown>;
      if (o["@graph"]) stack.push(o["@graph"]);
      const type = o["@type"];
      if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) {
        const org = first(o.hiringOrganization as Record<string, unknown>) as Record<string, unknown> | undefined;
        const sameAs = str(org?.sameAs) ?? str(org?.url);
        let companyDomain: string | null = null;
        try {
          companyDomain = sameAs ? new URL(sameAs).hostname.replace(/^www\./, "") : null;
        } catch {
          /* not a URL */
        }
        const remote = str(o.jobLocationType)?.toUpperCase() === "TELECOMMUTE";
        const desc = str(o.description);
        return {
          title: str(o.title),
          company: str(org?.name) ?? (typeof o.hiringOrganization === "string" ? o.hiringOrganization : null),
          companyDomain,
          location: placeText(o.jobLocation) ?? (remote ? "Remote" : null),
          workMode: remote ? "Remote" : null,
          salary: salaryText(o.baseSalary) ?? salaryText(o.estimatedSalary),
          description: desc ? htmlToText(decodeEntities(desc), 15_000) : null,
          deadline: str(o.validThrough)?.slice(0, 10) ?? null,
          source: null,
        };
      }
    }
  }
  return null;
}

/**
 * Keep only claims we can check: a keyword counts as matched only if it
 * actually appears in the CV text (the AI's lists are suggestions).
 */
export function verifyKeywords(resume: string, keywords: string[]) {
  const hay = ` ${resume.toLowerCase().replace(/[^a-z0-9+#./ -]+/g, " ").replace(/\s+/g, " ")} `;
  const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9+#./ -]+/g, " ").replace(/\s+/g, " ").trim();
  const matched: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const k of keywords) {
    const n = norm(k);
    if (!n || n.length > 60 || seen.has(n)) continue;
    seen.add(n);
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    (new RegExp(`[^a-z0-9]${esc}[^a-z0-9]`).test(hay) ? matched : missing).push(k.trim());
  }
  return { matched, missing };
}
