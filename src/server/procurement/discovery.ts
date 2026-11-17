import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { audit } from "./audit";
import { detectChanges } from "./changes";
import { RELEVANCE_MIN, scoreRelevance } from "./relevance";
import { fetchCanadaBuysOpenTenders } from "./sources/canadabuys";
import { fetchSamOpportunities } from "./sources/sam-gov";
import type { DiscoverySource, NormalizedOpportunity } from "./types";

/** Minimum time between manual runs of the same source. */
const MANUAL_COOLDOWN_MS = 15 * 60 * 1000;

export const samConfigured = () => !!process.env.SAM_GOV_API_KEY;

export function availableSources(): DiscoverySource[] {
  return samConfigured() ? ["sam_gov", "canadabuys"] : ["canadabuys"];
}

export type DiscoveryResult = {
  source: DiscoverySource;
  scanned: number;
  relevant: number;
  created: number;
  updated: number;
  error?: string;
};

/**
 * Search the configured sources for this workspace, store new relevant
 * opportunities, and record amendments/deadline changes on known ones.
 */
export async function runDiscovery(
  workspaceId: string,
  trigger: "schedule" | "manual",
  opts: { sources?: DiscoverySource[]; userId?: string } = {},
): Promise<DiscoveryResult[]> {
  const profile = await db.companyProfile.findUnique({ where: { workspaceId } });
  if (!profile) throw new Error("Set up the company profile before running discovery.");

  const sources = (opts.sources ?? availableSources()).filter((s) => availableSources().includes(s));
  const results: DiscoveryResult[] = [];

  for (const source of sources) {
    // Cooldown for manual runs: repeated clicks would burn the SAM.gov daily
    // quota (10 requests without a role) and re-download the CanadaBuys feed.
    if (trigger === "manual") {
      const recent = await db.discoveryRun.findFirst({
        where: { workspaceId, source, startedAt: { gt: new Date(Date.now() - MANUAL_COOLDOWN_MS) } },
        orderBy: { startedAt: "desc" },
      });
      if (recent) {
        const wait = Math.ceil((recent.startedAt.getTime() + MANUAL_COOLDOWN_MS - Date.now()) / 60000);
        results.push({
          source,
          scanned: 0,
          relevant: 0,
          created: 0,
          updated: 0,
          error: `${source === "sam_gov" ? "SAM.gov" : "CanadaBuys"} was searched a few minutes ago. Try again in ${wait} minute${wait === 1 ? "" : "s"}.`,
        });
        continue;
      }
    }
    const run = await db.discoveryRun.create({ data: { workspaceId, source, trigger } });
    const result: DiscoveryResult = { source, scanned: 0, relevant: 0, created: 0, updated: 0 };
    try {
      let items: NormalizedOpportunity[];
      if (source === "sam_gov") {
        const last = await db.discoveryRun.findFirst({
          where: { workspaceId, source, error: null, finishedAt: { not: null } },
          orderBy: { startedAt: "desc" },
        });
        const postedFrom = last ? new Date(last.startedAt.getTime() - 2 * 86400_000) : new Date(Date.now() - 30 * 86400_000);
        if (!profile.naicsCodes.length) throw new Error("Add NAICS codes to the company profile to search SAM.gov.");
        const sam = await fetchSamOpportunities({
          apiKey: process.env.SAM_GOV_API_KEY!,
          naicsCodes: profile.naicsCodes,
          postedFrom,
          maxRequests: Number(process.env.SAM_GOV_MAX_REQUESTS ?? 5) || 5,
        });
        items = sam.items;
        result.scanned = sam.scanned;
      } else {
        const cb = await fetchCanadaBuysOpenTenders();
        items = cb.items;
        result.scanned = cb.scanned;
      }

      const now = Date.now();
      const scored = items
        .filter((o) => !o.deadline || o.deadline.getTime() > now)
        .map((o) => ({ o, ...scoreRelevance(o, profile) }))
        .filter((x) => x.score >= RELEVANCE_MIN);
      result.relevant = scored.length;

      const { created, updated } = await store(workspaceId, source, scored);
      result.created = created;
      result.updated = updated;

      await db.discoveryRun.update({
        where: { id: run.id },
        data: { finishedAt: new Date(), scanned: result.scanned, created, updated },
      });
      await audit({
        workspaceId,
        actor: trigger === "schedule" ? "system" : "user",
        userId: opts.userId,
        action: "discovery.run",
        summary: `Searched ${source === "sam_gov" ? "SAM.gov" : "CanadaBuys"}: ${result.scanned} notices scanned, ${result.relevant} relevant, ${created} new, ${updated} updated`,
        detail: result,
      });
    } catch (e) {
      result.error = (e as Error).message;
      await db.discoveryRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), error: result.error.slice(0, 500) } });
      await audit({
        workspaceId,
        actor: "system",
        action: "discovery.failed",
        summary: `${source === "sam_gov" ? "SAM.gov" : "CanadaBuys"} search failed: ${result.error}`,
      });
    }
    results.push(result);
  }
  return results;
}

async function store(
  workspaceId: string,
  source: DiscoverySource,
  scored: { o: NormalizedOpportunity; score: number; matched: string[] }[],
) {
  if (!scored.length) return { created: 0, updated: 0 };

  const ids = scored.map((s) => s.o.externalId);
  const sols = scored.map((s) => s.o.solicitationNumber).filter((s): s is string => !!s);
  const existing = await db.opportunity.findMany({
    where: {
      workspaceId,
      source,
      OR: [{ externalId: { in: ids } }, ...(sols.length ? [{ solicitationNumber: { in: sols } }] : [])],
    },
    select: { id: true, externalId: true, solicitationNumber: true, title: true, deadline: true, amendmentNumber: true, description: true },
  });
  const byId = new Map(existing.map((e) => [e.externalId, e]));
  const bySol = new Map(existing.filter((e) => e.solicitationNumber).map((e) => [e.solicitationNumber!, e]));

  const fresh: Prisma.OpportunityCreateManyInput[] = [];
  let updated = 0;
  const seen = new Set<string>();

  for (const { o, score, matched } of scored) {
    // SAM.gov issues a new notice for each modification of a solicitation;
    // CanadaBuys keeps the reference and bumps the amendment number.
    const match = byId.get(o.externalId) ?? (o.solicitationNumber ? bySol.get(o.solicitationNumber) : undefined);
    if (match) {
      if (seen.has(match.id)) continue;
      seen.add(match.id);
      const isNewNotice = match.externalId !== o.externalId;
      const diff = detectChanges(match, o);
      if (!diff.changed && !isNewNotice) continue;
      await db.opportunity.update({
        where: { id: match.id },
        data: {
          externalId: o.externalId,
          title: o.title,
          deadline: o.deadline ?? match.deadline,
          amendmentNumber: o.amendmentNumber ?? match.amendmentNumber,
          amendedAt: diff.amended || isNewNotice ? new Date() : undefined,
          description: o.description || match.description,
          descriptionUrl: o.descriptionUrl,
          attachments: o.attachments as Prisma.InputJsonValue,
          sourceUrl: o.sourceUrl,
          noticeType: o.noticeType,
        },
      });
      updated++;
      await audit({
        workspaceId,
        actor: "system",
        opportunityId: match.id,
        action: "opportunity.amended",
        summary: [isNewNotice ? `New notice published (${o.noticeType ?? "update"})` : null, ...diff.changes].filter(Boolean).join("; "),
      });
      continue;
    }
    if (seen.has(`new:${o.externalId}`)) continue;
    seen.add(`new:${o.externalId}`);
    fresh.push({
      workspaceId,
      source,
      externalId: o.externalId,
      title: o.title,
      organization: o.organization,
      referenceNumber: o.referenceNumber,
      solicitationNumber: o.solicitationNumber,
      noticeType: o.noticeType,
      sourceUrl: o.sourceUrl,
      postedAt: o.postedAt,
      deadline: o.deadline,
      estimatedValue: o.estimatedValue,
      currency: o.currency,
      country: o.country,
      placeOfPerformance: o.placeOfPerformance,
      setAside: o.setAside,
      classificationCodes: o.classificationCodes,
      description: o.description,
      descriptionUrl: o.descriptionUrl,
      attachments: o.attachments as Prisma.InputJsonValue,
      contacts: o.contacts as Prisma.InputJsonValue,
      amendmentNumber: o.amendmentNumber,
      relevance: score,
      matchedKeywords: matched,
    });
  }

  let created = 0;
  for (let i = 0; i < fresh.length; i += 200) {
    created += (await db.opportunity.createMany({ data: fresh.slice(i, i + 200), skipDuplicates: true })).count;
  }
  if (fresh.length) {
    const rows = await db.opportunity.findMany({
      where: { workspaceId, source, externalId: { in: fresh.map((f) => f.externalId) } },
      select: { id: true, relevance: true },
    });
    await db.auditLog.createMany({
      data: rows.map((r) => ({
        workspaceId,
        opportunityId: r.id,
        actor: "system" as const,
        action: "opportunity.discovered",
        summary: `Found on ${source === "sam_gov" ? "SAM.gov" : "CanadaBuys"} (keyword relevance ${r.relevance})`,
      })),
    });
  }
  return { created, updated };
}
