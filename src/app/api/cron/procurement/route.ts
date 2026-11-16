import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { isAiConfigured } from "@/server/ai/provider";
import { runDiscovery } from "@/server/procurement/discovery";
import { qualifyOpportunity } from "@/server/procurement/qualify";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Time left for AI qualification after discovery, within the 60 s limit. */
const BUDGET_MS = 50_000;

/**
 * Daily discovery (Vercel Cron, see vercel.json): search every workspace's
 * sources, then qualify the most relevant new opportunities while time allows.
 * The rest are qualified on demand from the app.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const workspaces = await db.companyProfile.findMany({ select: { workspaceId: true } });
  const summary: Record<string, unknown>[] = [];

  for (const { workspaceId } of workspaces) {
    if (Date.now() - started > BUDGET_MS) break;
    const results = await runDiscovery(workspaceId, "schedule").catch((e: Error) => [{ error: e.message }]);
    let qualified = 0;
    if (isAiConfigured()) {
      const candidates = await db.opportunity.findMany({
        where: { workspaceId, qualifiedAt: null, status: "discovered", OR: [{ deadline: null }, { deadline: { gt: new Date() } }] },
        orderBy: { relevance: "desc" },
        take: 5,
        select: { id: true },
      });
      for (const c of candidates) {
        if (Date.now() - started > BUDGET_MS - 15_000) break;
        await qualifyOpportunity(c.id, { trigger: "schedule" })
          .then(() => qualified++)
          .catch((e) => console.error("[procurement cron] qualify failed", c.id, (e as Error).message));
      }
    }
    summary.push({ workspaceId, results, qualified });
  }
  return NextResponse.json({ ok: true, ms: Date.now() - started, summary });
}
