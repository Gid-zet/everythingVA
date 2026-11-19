import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { runDigests, runReminders } from "@/server/tasks/notifications";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Task reminders and the morning digest. Call every 5 minutes for on-time
 * reminders (an external scheduler such as cron-job.org, or Vercel Pro cron),
 * with the header `Authorization: Bearer <CRON_SECRET>`. vercel.json also runs
 * it once a day as a fallback, which is enough for the digest.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const reminders = await runReminders(db, now);
  const digests = await runDigests(db, now);
  return NextResponse.json({ ok: true, reminders, digests });
}
