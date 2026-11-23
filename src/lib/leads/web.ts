/**
 * Pure helpers for web prospecting (tested). The crawler only reads public
 * company websites: it honours robots.txt, never logs in, and skips social
 * networks, directories and marketplaces whose terms forbid scraping.
 */

/** Sites that aren't a prospect's own website (or forbid scraping). */
const SKIP_DOMAINS = [
  "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "pinterest.com", "reddit.com", "quora.com",
  "wikipedia.org", "medium.com", "substack.com", "github.com", "crunchbase.com", "zoominfo.com", "apollo.io", "rocketreach.co", "dnb.com", "bloomberg.com",
  "yelp.com", "yellowpages.com", "bbb.org", "glassdoor.com", "indeed.com", "ziprecruiter.com", "clutch.co", "g2.com", "capterra.com", "trustpilot.com",
  "upwork.com", "fiverr.com", "amazon.com", "ebay.com", "google.com", "maps.google.com", "apple.com", "microsoft.com", "forbes.com", "nytimes.com",
  "reuters.com", "prnewswire.com", "businesswire.com", "globenewswire.com", "manta.com", "opencorporates.com", "companieshouse.gov.uk", "sam.gov", "tripadvisor.com", "mapquest.com",
];

export function hostOf(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isSkippedDomain(host: string) {
  const h = host.toLowerCase().replace(/^www\./, "");
  return SKIP_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`)) || /\.(gov|mil)(\.[a-z]{2})?$/.test(h);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#64": "@", "#x40": "@", "#46": ".", "#x2e": "." };
export const decodeEntities = (s: string) => s.replace(/&(#?x?[0-9a-z]+);/gi, (m, e: string) => ENTITIES[e.toLowerCase()] ?? m);

/** Visible text of a page (scripts, styles and markup removed). */
export function htmlToText(html: string, max = 20_000) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, max);
}

export function pageTitle(html: string) {
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{2,80})["']/i)?.[1];
  const t = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1];
  return decodeEntities((og ?? t ?? "").trim()).replace(/\s+/g, " ") || null;
}

export function metaDescription(html: string) {
  const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{2,400})["']/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']{2,400})["'][^>]+name=["']description["']/i)?.[1];
  return m ? decodeEntities(m.trim()) : null;
}

const EMAIL = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,24}/gi;
const BAD_EMAIL = /\.(png|jpe?g|gif|webp|svg|css|js)$|@(example|domain|email|yourdomain|sentry|wixpress|sentry-next)\.|^(your|name|email|user|first|firstname)(\.last)?@|@\d+x\./i;

/** Emails published on a page: mailto links, plain text, and "name [at] firm [dot] com". */
export function extractEmails(html: string) {
  const found = new Set<string>();
  const add = (e: string) => {
    const v = e.toLowerCase().replace(/^mailto:/, "").split("?")[0]!.trim().replace(/[.,;:]+$/, "");
    if (v.length <= 254 && !BAD_EMAIL.test(v) && /^[^@\s]+@[^@\s]+\.[a-z]{2,24}$/.test(v)) found.add(v);
  };
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) add(decodeURIComponent(m[1]!));
  const text = decodeEntities(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s*[[(]\s*at\s*[\])]\s*/gi, "@")
    .replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, ".");
  for (const m of text.matchAll(EMAIL)) add(m[0]);
  return [...found];
}

/** Phone numbers from tel: links only (free-text numbers are too noisy). */
export function extractPhones(html: string) {
  const out = new Set<string>();
  for (const m of html.matchAll(/href=["']tel:([^"']{5,30})["']/gi)) {
    const v = decodeURIComponent(m[1]!).replace(/[^\d+()\-.\s]/g, "").trim();
    if (v.replace(/\D/g, "").length >= 7) out.add(v);
  }
  return [...out].slice(0, 3);
}

/** Same-site links that usually list people or contact details. */
export function contactLinks(html: string, base: string, max = 3) {
  const host = hostOf(base);
  const scored: { url: string; score: number }[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    let url: URL;
    try {
      url = new URL(m[1]!, base);
    } catch {
      continue;
    }
    if (hostOf(url.href) !== host || /\.(pdf|jpe?g|png|zip|docx?)$/i.test(url.pathname)) continue;
    const key = url.pathname.replace(/\/$/, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    const hay = `${key} ${m[2]!.replace(/<[^>]+>/g, " ")}`.toLowerCase();
    const score = /contact/.test(hay) ? 3 : /(team|leadership|people|management|our-?story|who-we-are)/.test(hay) ? 2 : /about/.test(hay) ? 1 : 0;
    if (!score) continue;
    seen.add(key);
    url.hash = "";
    scored.push({ url: url.href, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map((s) => s.url);
}

/** The company's LinkedIn page, if the site links to it (we link to it; we never fetch it). */
export function linkedinUrl(html: string) {
  return html.match(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/[A-Za-z0-9_\-%.]+/i)?.[0] ?? null;
}

/**
 * robots.txt check (RFC 9309): the group for our user agent, else "*";
 * the longest matching rule wins and Allow wins ties.
 */
export function robotsAllows(robots: string, path: string, ua: string) {
  type Group = { agents: string[]; rules: { allow: boolean; pattern: string }[] };
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && cur) {
      lastWasAgent = false;
      if (val) cur.rules.push({ allow: key === "allow", pattern: val });
    } else lastWasAgent = false;
  }
  const token = ua.toLowerCase().split(/[\s/]/)[0]!;
  const group = groups.find((g) => g.agents.some((a) => a !== "*" && token.includes(a))) ?? groups.find((g) => g.agents.includes("*"));
  if (!group) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of group.rules) {
    const re = new RegExp("^" + r.pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (!re.test(path)) continue;
    if (!best || r.pattern.length > best.len || (r.pattern.length === best.len && r.allow)) best = { allow: r.allow, len: r.pattern.length };
  }
  return best ? best.allow : true;
}

/** Private, loopback, link-local and other non-public addresses (SSRF guard). */
export function isPrivateIp(ip: string) {
  const v = ip.toLowerCase().replace(/^::ffff:/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) {
    const [a, b] = v.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v);
}
