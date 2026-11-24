import "server-only";
import { lookup, resolveMx } from "node:dns/promises";
import { contactLinks, extractEmails, extractPhones, hostOf, htmlToText, isPrivateIp, isSkippedDomain, linkedinUrl, metaDescription, pageTitle, robotsAllows } from "@/lib/leads/web";

/**
 * A polite, locked-down crawler for public company websites.
 * - Identifies itself and honours robots.txt.
 * - Only http(s) on ports 80/443; every hop (including redirects) is resolved
 *   and refused if it points at a private or internal address (SSRF guard).
 * - Small time and size budgets; HTML only; never submits forms or logs in.
 */

export const USER_AGENT = `EverythingVA-LeadFinder/1.0 (+${process.env.KINDE_SITE_URL ?? "https://everythingva.app"}/lead-finder)`;
const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8000;

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http(s) URLs");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("Blocked port");
  if (url.username || url.password) throw new Error("Credentials in URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) throw new Error("Blocked host");
  const addrs = await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("Blocked address");
}

async function readCapped(res: Response) {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

/** GET a public URL safely. Returns null for errors, non-HTML or blocked targets. */
export async function safeFetch(input: string, accept = "text/html"): Promise<{ url: string; body: string } | null> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  for (let hop = 0; hop < 4; hop++) {
    try {
      await assertPublic(url);
      const res = await fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": USER_AGENT, Accept: `${accept},*/*;q=0.5`, "Accept-Language": "en" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return null;
        url = new URL(loc, url);
        continue;
      }
      if (!res.ok) return null;
      const type = res.headers.get("content-type") ?? "";
      if (accept === "text/html" && !/html|xml/i.test(type)) return null;
      return { url: url.href, body: await readCapped(res) };
    } catch {
      return null;
    }
  }
  return null;
}

const robotsCache = new Map<string, { at: number; txt: string | null }>();
async function allowed(url: string) {
  const u = new URL(url);
  const key = u.origin;
  let hit = robotsCache.get(key);
  if (!hit || Date.now() - hit.at > 6 * 3600_000) {
    const r = await safeFetch(`${key}/robots.txt`, "text/plain");
    hit = { at: Date.now(), txt: r?.body.slice(0, 200_000) ?? null };
    robotsCache.set(key, hit);
    if (robotsCache.size > 2000) robotsCache.clear();
  }
  return hit.txt == null || robotsAllows(hit.txt, u.pathname + u.search, USER_AGENT);
}

export type CrawledSite = {
  domain: string;
  url: string;
  title: string | null;
  description: string | null;
  text: string;
  emails: string[];
  phones: string[];
  linkedin: string | null;
  pages: string[];
  blockedByRobots: boolean;
};

/** One public page, if robots.txt allows it (null when blocked or unreadable). */
export async function fetchAllowed(url: string) {
  try {
    if (!(await allowed(url))) return { blocked: true as const };
  } catch {
    return null;
  }
  const page = await safeFetch(url);
  return page ? { blocked: false as const, ...page } : null;
}

/** Homepage plus up to two contact/about/team pages of one company website. */
export async function crawlSite(domainOrUrl: string): Promise<CrawledSite | null> {
  const start = /^https?:\/\//i.test(domainOrUrl) ? domainOrUrl : `https://${domainOrUrl}/`;
  const host = hostOf(start);
  if (!host || isSkippedDomain(host)) return null;
  const home = `https://${host}/`;
  if (!(await allowed(home))) return { domain: host, url: home, title: null, description: null, text: "", emails: [], phones: [], linkedin: null, pages: [], blockedByRobots: true };
  const first = (await safeFetch(home)) ?? (await safeFetch(`https://www.${host}/`));
  if (!first) return null;
  const finalHost = hostOf(first.url) ?? host;
  const links = contactLinks(first.body, first.url, 2);
  const extra = (
    await Promise.all(
      links.map(async (l) => {
        if (!(await allowed(l))) return null;
        return safeFetch(l);
      }),
    )
  ).filter((p): p is { url: string; body: string } => !!p && hostOf(p.url) === finalHost);
  const all = [first, ...extra];
  const emails = [...new Set(all.flatMap((p) => extractEmails(p.body)))];
  return {
    domain: finalHost,
    url: first.url,
    title: pageTitle(first.body),
    description: metaDescription(first.body),
    text: all.map((p, i) => `--- ${i === 0 ? "Homepage" : "Page"}: ${p.url}\n${htmlToText(p.body, i === 0 ? 6000 : 4000)}`).join("\n"),
    emails,
    phones: [...new Set(all.flatMap((p) => extractPhones(p.body)))].slice(0, 3),
    linkedin: linkedinUrl(first.body),
    pages: all.map((p) => p.url),
    blockedByRobots: false,
  };
}

/** Does the domain accept email at all? */
export async function hasMx(domain: string) {
  try {
    const mx = await Promise.race([resolveMx(domain), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000))]);
    return mx.length > 0;
  } catch {
    return false;
  }
}
