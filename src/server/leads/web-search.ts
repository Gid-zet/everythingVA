import "server-only";

/**
 * Web search providers for prospecting. Configure one:
 *   SERPER_API_KEY        serper.dev (Google results)
 *   BRAVE_SEARCH_API_KEY  api.search.brave.com (independent index)
 *   TAVILY_API_KEY        tavily.com (1,000 free searches a month, no card)
 * Optional enrichment:
 *   HUNTER_API_KEY        hunter.io domain search (published work emails)
 */

export type SearchHit = { url: string; title: string; snippet: string };

export const searchProvider = () =>
  process.env.SERPER_API_KEY ? "serper" : process.env.BRAVE_SEARCH_API_KEY ? "brave" : process.env.TAVILY_API_KEY ? "tavily" : null;

/** Never the prospect's own site, and their terms forbid scraping. */
const TAVILY_EXCLUDE = ["linkedin.com", "facebook.com", "instagram.com", "x.com", "twitter.com", "yelp.com", "youtube.com", "wikipedia.org", "glassdoor.com", "indeed.com"];
export const hunterConfigured = () => !!process.env.HUNTER_API_KEY;

/**
 * Search, optionally limited to some sites (Tavily filters natively; Serper and
 * Brave get site: operators).
 */
export async function searchWeb(q: string, count = 10, onlySites: string[] = []): Promise<SearchHit[]> {
  const provider = searchProvider();
  if (onlySites.length && provider !== "tavily") q = `${q} (${onlySites.map((d) => `site:${d}`).join(" OR ")})`;
  if (provider === "serper") {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": process.env.SERPER_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ q, num: count }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Search failed (${res.status})`);
    const json = (await res.json()) as { organic?: { link: string; title?: string; snippet?: string }[] };
    return (json.organic ?? []).map((r) => ({ url: r.link, title: r.title ?? "", snippet: r.snippet ?? "" }));
  }
  if (provider === "brave") {
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${count}`, {
      headers: { "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY!, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Search failed (${res.status})`);
    const json = (await res.json()) as { web?: { results?: { url: string; title?: string; description?: string }[] } };
    return (json.web?.results ?? []).map((r) => ({ url: r.url, title: r.title ?? "", snippet: (r.description ?? "").replace(/<[^>]+>/g, "") }));
  }
  if (provider === "tavily") {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}`, "Content-Type": "application/json" },
      // Basic depth costs 1 credit per search.
      body: JSON.stringify({ query: q, max_results: Math.min(20, count), search_depth: "basic", topic: "general", ...(onlySites.length ? { include_domains: onlySites } : { exclude_domains: TAVILY_EXCLUDE }) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Search failed (${res.status})`);
    const json = (await res.json()) as { results?: { url: string; title?: string; content?: string }[] };
    return (json.results ?? []).map((r) => ({ url: r.url, title: r.title ?? "", snippet: (r.content ?? "").slice(0, 400) }));
  }
  throw new Error("No web search provider is configured.");
}

export type HunterPerson = { email: string; name: string | null; title: string | null; confidence: number };

/** People with published work emails at a domain (only if HUNTER_API_KEY is set). */
export async function hunterDomainSearch(domain: string): Promise<HunterPerson[]> {
  if (!hunterConfigured()) return [];
  try {
    const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=5&type=personal&api_key=${process.env.HUNTER_API_KEY}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { emails?: { value: string; first_name?: string; last_name?: string; position?: string; confidence?: number }[] } };
    return (json.data?.emails ?? [])
      .filter((e) => (e.confidence ?? 0) >= 70)
      .map((e) => ({
        email: e.value.toLowerCase(),
        name: [e.first_name, e.last_name].filter(Boolean).join(" ") || null,
        title: e.position ?? null,
        confidence: e.confidence ?? 0,
      }));
  } catch {
    return [];
  }
}
