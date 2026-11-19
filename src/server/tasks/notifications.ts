import "server-only";
import webpush from "web-push";
import type { PrismaClient } from "@prisma/client";
import { getProviders } from "@/server/providers";
import { computeRemindAt, digestDue, relativeToNow, zonedParts } from "@/lib/tasks/reminders";
import { addDays } from "@/lib/tasks/recurrence";

/**
 * Task reminders:
 *  - Web Push to every browser/device the user allowed, when a task's
 *    reminder time arrives (sent by /api/cron/reminders).
 *  - A morning email digest of what's due, sent from the user's own
 *    connected mailbox to itself.
 */

export const DEFAULT_NOTIFICATION_SETTINGS = {
  timezone: "UTC",
  pushEnabled: true,
  defaultReminderMinutes: 30,
  dateOnlyReminderHour: 9,
  digestEnabled: true,
  digestHour: 7,
  digestAccountId: null as string | null,
  lastDigestDate: null as string | null,
};

export async function getNotificationSettings(db: PrismaClient, userId: string) {
  const row = await db.notificationSettings.findUnique({ where: { userId } });
  return row ?? { userId, ...DEFAULT_NOTIFICATION_SETTINGS };
}

export function pushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let vapidSet = false;
function ensureVapid() {
  if (vapidSet) return true;
  if (!pushConfigured()) return false;
  const subject = process.env.VAPID_SUBJECT ?? process.env.NEXT_PUBLIC_URL ?? process.env.KINDE_SITE_URL ?? "https://localhost";
  webpush.setVapidDetails(subject, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  vapidSet = true;
  return true;
}

/** Recompute one task's reminder (call after any change to its date, time, status or reminder). */
export async function syncReminder(db: PrismaClient, userId: string, taskId: string) {
  const [task, s] = await Promise.all([
    db.task.findFirst({ where: { id: taskId, userId }, select: { id: true, status: true, dueDate: true, dueTime: true, reminderMinutes: true, remindAt: true } }),
    getNotificationSettings(db, userId),
  ]);
  if (!task) return;
  const next = computeRemindAt(task, s);
  if ((next?.getTime() ?? null) !== (task.remindAt?.getTime() ?? null)) {
    await db.task.update({ where: { id: task.id }, data: { remindAt: next, reminderSentAt: null } });
  }
}

/** Recompute every open task's reminder (after the user changes settings or time zone). */
export async function syncAllReminders(db: PrismaClient, userId: string) {
  const s = await getNotificationSettings(db, userId);
  const tasks = await db.task.findMany({
    where: { userId, status: { notIn: ["done", "canceled"] }, dueDate: { not: null } },
    select: { id: true, status: true, dueDate: true, dueTime: true, reminderMinutes: true, remindAt: true },
    take: 5000,
  });
  for (const t of tasks) {
    const next = computeRemindAt(t, s);
    if ((next?.getTime() ?? null) !== (t.remindAt?.getTime() ?? null)) {
      await db.task.update({ where: { id: t.id }, data: { remindAt: next, reminderSentAt: null } });
    }
  }
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

/** Send to all of a user's devices; drop subscriptions the browser has revoked. */
export async function sendPush(db: PrismaClient, userId: string, payload: PushPayload) {
  if (!ensureVapid()) return { sent: 0, failed: 0, reason: "Push isn't configured on the server (VAPID keys)." };
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 60 * 60 });
        sent++;
        await db.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
      } catch (e) {
        failed++;
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        else console.error("[push] send failed", code, (e as Error).message);
      }
    }),
  );
  return { sent, failed, reason: subs.length ? null : "No devices have allowed notifications yet." };
}

const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h! % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h! >= 12 ? "PM" : "AM"}`;
};

/** Send reminders that have come due (skipping ones more than 6 hours late). */
export async function runReminders(db: PrismaClient, now = new Date()) {
  const due = await db.task.findMany({
    where: {
      remindAt: { lte: now, gte: new Date(now.getTime() - 6 * 3600_000) },
      reminderSentAt: null,
      status: { notIn: ["done", "canceled"] },
    },
    orderBy: { remindAt: "asc" },
    take: 500,
    select: { id: true, userId: true, title: true, dueDate: true, dueTime: true, dueAt: true, priority: true },
  });
  let sent = 0;
  const byUser = new Map<string, typeof due>();
  for (const t of due) byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), t]);

  for (const [userId, tasks] of byUser) {
    const s = await getNotificationSettings(db, userId);
    for (const t of tasks) {
      // Mark first so a slow or failing push can't send twice.
      await db.task.update({ where: { id: t.id }, data: { reminderSentAt: now } });
      if (!s.pushEnabled) continue;
      const when = t.dueTime && t.dueAt ? `${relativeToNow(t.dueAt, now)} · ${fmtTime(t.dueTime)}` : t.dueDate === zonedParts(now, s.timezone).date ? "today" : `on ${t.dueDate}`;
      const r = await sendPush(db, userId, {
        title: t.priority === "urgent" ? `Urgent: ${t.title}` : t.title,
        body: `Due ${when}`,
        url: `/tasks?view=today&task=${t.id}`,
        tag: `task-${t.id}`,
      });
      sent += r.sent;
    }
  }
  return { due: due.length, sent };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Build and send one user's digest; returns what happened. */
export async function sendDigest(db: PrismaClient, userId: string, localDate: string, opts: { force?: boolean } = {}) {
  const s = await getNotificationSettings(db, userId);
  const tasks = await db.task.findMany({
    where: { userId, status: { notIn: ["done", "canceled"] }, dueDate: { lte: addDays(localDate, 1) } },
    orderBy: [{ dueDate: "asc" }, { dueTime: { sort: "asc", nulls: "first" } }],
    take: 200,
    select: { id: true, title: true, dueDate: true, dueTime: true, priority: true },
  });
  const overdue = tasks.filter((t) => t.dueDate! < localDate);
  const today = tasks.filter((t) => t.dueDate === localDate);
  const tomorrow = tasks.filter((t) => t.dueDate === addDays(localDate, 1));
  if (!opts.force && !overdue.length && !today.length) return { sent: false, reason: "Nothing due or overdue" };

  const account = await db.account.findFirst({
    where: { userId, ...(s.digestAccountId ? { id: s.digestAccountId } : {}), status: { not: "needs_reauth" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, emailAddress: true, name: true },
  });
  if (!account) return { sent: false, reason: "No connected mail account to send from" };

  const base = process.env.NEXT_PUBLIC_URL ?? process.env.KINDE_SITE_URL ?? "";
  const item = (t: (typeof tasks)[number]) =>
    `<li style="margin:4px 0"><a href="${esc(base)}/tasks?view=today&amp;task=${t.id}" style="color:#111827;text-decoration:none">${esc(t.title)}</a>${
      t.dueTime ? ` <span style="color:#6b7280">· ${fmtTime(t.dueTime)}</span>` : ""
    }${t.priority === "urgent" || t.priority === "high" ? ` <span style="color:#dc2626">· ${t.priority}</span>` : ""}</li>`;
  const section = (title: string, list: typeof tasks, color: string) =>
    list.length ? `<h3 style="margin:20px 0 6px;font-size:14px;color:${color}">${title} (${list.length})</h3><ul style="margin:0;padding-left:18px">${list.map(item).join("")}</ul>` : "";
  const body = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;color:#111827;max-width:560px">
<div style="background:linear-gradient(120deg,#312e81,#4f46e5,#7c3aed);color:#fff;border-radius:16px;padding:20px 22px">
<p style="margin:0;font-size:12px;opacity:.8;letter-spacing:.08em;text-transform:uppercase">everythingVA · ${esc(localDate)}</p>
<h2 style="margin:6px 0 0;font-size:20px">${today.length} due today${overdue.length ? `, ${overdue.length} overdue` : ""}</h2></div>
${section("Overdue", overdue, "#dc2626")}${section("Today", today, "#4f46e5")}${section("Tomorrow", tomorrow, "#6b7280")}
${!overdue.length && !today.length ? `<p style="margin-top:16px">Nothing due today. Enjoy the clear day.</p>` : ""}
<p style="margin-top:22px"><a href="${esc(base)}/tasks?view=today" style="background:#4f46e5;color:#fff;padding:9px 14px;border-radius:10px;text-decoration:none">Open Today</a></p>
<p style="margin-top:18px;color:#9ca3af;font-size:12px">You get this because the morning digest is on. Turn it off in Tasks → Reminders.</p></div>`;

  const { mail } = await getProviders(account.id, userId);
  await mail.send({
    from: { address: account.emailAddress, name: account.name ?? account.emailAddress },
    to: [{ address: account.emailAddress, name: account.name ?? account.emailAddress }],
    subject: `Today: ${today.length} due${overdue.length ? `, ${overdue.length} overdue` : ""}`,
    body,
  });
  return { sent: true, reason: null };
}

/** Send digests to everyone whose local digest hour has arrived today. */
export async function runDigests(db: PrismaClient, now = new Date(), budgetMs = 40_000) {
  const start = Date.now();
  const rows = await db.notificationSettings.findMany({ where: { digestEnabled: true } });
  let sent = 0;
  for (const s of rows) {
    if (Date.now() - start > budgetMs) break;
    const localDate = digestDue(now, s);
    if (!localDate) continue;
    await db.notificationSettings.update({ where: { userId: s.userId }, data: { lastDigestDate: localDate } });
    const r = await sendDigest(db, s.userId, localDate).catch((e: Error) => ({ sent: false, reason: e.message }));
    if (r.sent) sent++;
    else if (r.reason && r.reason !== "Nothing due or overdue") console.warn("[digest]", s.userId, r.reason);
  }
  return { checked: rows.length, sent };
}
