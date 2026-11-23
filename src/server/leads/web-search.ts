import "server-only";

/**
 * Web search providers for prospecting. Configure one:
 *   SERPER_API_KEY        serper.dev (Google results)
 *   BRAVE_SEARCH_API_KEY  api.search.brave.com (independent index)
 * Optional enrichment:
 *   HUNTER_API_KEY        hunter.io domain search (published work emails)
 */

export type SearchHit = { url: string; title: string; snippet: string };

export const searchProvider = () => (process.env.SERPER_API_KEY ? "serper" : process.env.BRAVE_SEARCH_API_KEY ? "brave" : null);
export const hunterConfigured = () => !!process.env.HUNTER_API_KEY;

export async function searchWeb(q: string, count = 10): Promise<SearchHit[]> {
  const provider = searchProvider();
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
