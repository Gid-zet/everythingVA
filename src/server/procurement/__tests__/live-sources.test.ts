/**
 * Live checks against the real feeds. Off by default (network, large file).
 * Run with: LIVE_SOURCES=1 npx vitest run src/server/procurement/__tests__/live-sources.test.ts
 */
import { describe, expect, it } from "vitest";
import { fetchCanadaBuysOpenTenders } from "../sources/canadabuys";
import { RELEVANCE_MIN, scoreRelevance } from "../relevance";
import { CCM_TEMPLATE } from "../ccm-template";

describe.skipIf(!process.env.LIVE_SOURCES)("live sources", () => {
  it("parses the CanadaBuys open tender feed and finds relevant notices", async () => {
    const { items, scanned } = await fetchCanadaBuysOpenTenders();
    expect(scanned).toBeGreaterThan(100);
    expect(items.length).toBeGreaterThan(100);
    expect(items.every((o) => o.externalId && o.title && o.sourceUrl.startsWith("http"))).toBe(true);
    const relevant = items
      .map((o) => ({ o, ...scoreRelevance(o, CCM_TEMPLATE) }))
      .filter((x) => x.score >= RELEVANCE_MIN)
      .sort((a, b) => b.score - a.score);
    console.log(`CanadaBuys: ${scanned} rows, ${items.length} notices, ${relevant.length} relevant`);
    for (const r of relevant.slice(0, 15)) console.log(`  ${r.score}  ${r.o.title}  [${r.matched.join(", ")}]  closes ${r.o.deadline?.toISOString().slice(0, 10)}`);
  }, 60_000);
});
