import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { runDigests, runReminders } from "@/server/tasks/notifications";
import { discoverForAll } from "@/server/jobs/discover";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Task reminders and the morning digest. Call every 5 minutes for on-time
 * reminders (an external scheduler such as cron-job.org, or Vercel Pro cron),
 * with the header `Authorization: Bearer <CRON_SECRET>`. vercel.json also runs
 * it once a day as a fallback, which is enough for the digest.
 *
 * It also runs daily job discovery (Hobby plans allow only two cron jobs). Each
 * user is searched at most once every 20 hours, so frequent calls are cheap.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const now = new Date();
  const reminders = await runReminders(db, now);
  const digests = await runDigests(db, now);
  const jobs = await discoverForAll(db, started + 55_000).catch((e: Error) => ({ error: e.message }));
  return NextResponse.json({ ok: true, reminders, digests, jobs });
}
