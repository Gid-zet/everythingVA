import type { NormalizedOpportunity } from "../types";

/**
 * SAM.gov Get Opportunities Public API (v2).
 * https://open.gsa.gov/api/get-opportunities-public-api/
 *
 * Daily limits depend on the key: 10 requests for a SAM.gov account with no
 * role, 1,000 with a role. Discovery makes one request per NAICS code, capped
 * by SAM_GOV_MAX_REQUESTS (default 5).
 */
export const SAM_SEARCH_URL = "https://api.sam.gov/opportunities/v2/search";

type SamRecord = {
  noticeId: string;
  title?: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  postedDate?: string;
  type?: string;
  baseType?: string;
  active?: string;
  responseDeadLine?: string | null;
  naicsCode?: string;
  classificationCode?: string;
  typeOfSetAsideDescription?: string | null;
  description?: string;
  uiLink?: string;
  resourceLinks?: string[] | null;
  pointOfContact?: { fullName?: string; email?: string; phone?: string }[] | null;
  placeOfPerformance?: {
    city?: { name?: string };
    state?: { code?: string; name?: string };
    country?: { code?: string; name?: string };
  } | null;
};

const fmt = (d: Date) =>
  `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;

function date(value?: string | null) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Map one API record; returns null for notices we don't track (awards, inactive). */
export function mapSamRecord(r: SamRecord): NormalizedOpportunity | null {
  if (!r.noticeId || !r.title) return null;
  if (r.active && r.active.toLowerCase() === "no") return null;
  if (/award/i.test(r.type ?? "") || /award/i.test(r.baseType ?? "")) return null;

  const path = (r.fullParentPathName ?? "").split(".").filter(Boolean);
  const pop = r.placeOfPerformance;
  const place = [pop?.city?.name, pop?.state?.code ?? pop?.state?.name, pop?.country?.code].filter(Boolean).join(", ");

  return {
    source: "sam_gov",
    externalId: r.noticeId,
    title: r.title.trim(),
    organization: path.length ? (path.length > 2 ? `${path[0]} / ${path[path.length - 1]}` : path.join(" / ")) : undefined,
    solicitationNumber: r.solicitationNumber || undefined,
    referenceNumber: r.solicitationNumber || undefined,
    noticeType: r.type || undefined,
    sourceUrl: r.uiLink && r.uiLink.startsWith("http") ? r.uiLink : `https://sam.gov/opp/${r.noticeId}/view`,
    postedAt: date(r.postedDate),
    deadline: date(r.responseDeadLine),
    country: pop?.country?.code ?? "USA",
    placeOfPerformance: place || undefined,
    setAside: r.typeOfSetAsideDescription || undefined,
    classificationCodes: [r.naicsCode, r.classificationCode].filter((c): c is string => !!c),
    descriptionUrl: r.description && r.description.startsWith("http") ? r.description : undefined,
    description: r.description && !r.description.startsWith("http") ? r.description : undefined,
    attachments: (r.resourceLinks ?? []).map((url) => ({ url })),
    contacts: (r.pointOfContact ?? []).map((c) => ({ name: c.fullName, email: c.email, phone: c.phone })),
  };
}

export async function fetchSamOpportunities(opts: {
  apiKey: string;
  naicsCodes: string[];
  postedFrom: Date;
  postedTo?: Date;
  maxRequests: number;
}): Promise<{ items: NormalizedOpportunity[]; requests: number; scanned: number }> {
  const items = new Map<string, NormalizedOpportunity>();
  let requests = 0;
  let scanned = 0;
  const to = opts.postedTo ?? new Date();
  // The API allows at most one year per query.
  const from = new Date(Math.max(opts.postedFrom.getTime(), to.getTime() - 364 * 86400_000));

  for (const code of opts.naicsCodes.slice(0, opts.maxRequests)) {
    const url = new URL(SAM_SEARCH_URL);
    url.searchParams.set("api_key", opts.apiKey);
    url.searchParams.set("postedFrom", fmt(from));
    url.searchParams.set("postedTo", fmt(to));
    url.searchParams.set("ncode", code);
    url.searchParams.set("limit", "1000");
    url.searchParams.set("offset", "0");
    requests++;
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (res.status === 429) throw new Error("SAM.gov daily request limit reached. Discovery will resume tomorrow.");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`SAM.gov returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
    const json = (await res.json()) as { opportunitiesData?: SamRecord[] };
    for (const r of json.opportunitiesData ?? []) {
      scanned++;
      const o = mapSamRecord(r);
      if (o) items.set(o.externalId, o);
    }
  }
  return { items: [...items.values()], requests, scanned };
}

/** Fetch a notice's full description (the search result only links to it). */
export async function fetchSamDescription(descriptionUrl: string, apiKey: string) {
  const url = new URL(descriptionUrl);
  url.searchParams.set("api_key", apiKey);
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { description?: string } | null;
  const html = json?.description;
  if (!html) return null;
  return html
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}
