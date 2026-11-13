import "server-only";
import { waitUntil } from "@vercel/functions";
import Account from "@/lib/account";
import { db } from "@/server/db";

/**
 * Keeps mail flowing even when provider webhooks don't arrive.
 *
 * Background: the original code registered Aurinko webhooks to a hard-coded
 * temporary dev tunnel, so production never received notifications and
 * mailboxes silently stopped syncing. Two safeguards:
 *  1. `ensureMailWebhook` points the account's subscription at this deployment
 *     and removes subscriptions aimed anywhere else.
 *  2. `scheduleCatchUp` runs an incremental sync in the background whenever
 *     the app is open and the account hasn't synced for a couple of minutes.
 */

const STALE_MS = 2 * 60 * 1000;
const RESET_AFTER_DAYS = 14;

function webhookTarget() {
  const base = process.env.AURINKO_WEBHOOK_BASE_URL ?? process.env.NEXT_PUBLIC_URL;
  if (!base || /localhost|127\.0\.0\.1/.test(base)) return null;
  return `${base.replace(/\/$/, "")}/api/aurinko/webhook`;
}

export async function ensureMailWebhook(accountId: string) {
  const target = webhookTarget();
  if (!target) return { changed: false, reason: "No public URL configured" };
  const acc = await Account.forId(accountId);
  const { records } = await acc.getWebhooks();
  const mail = records.filter((r) => r.resource === "/email/messages");
  let changed = false;
  for (const r of mail) {
    if (r.notificationUrl !== target) {
      await acc.deleteWebhook(String(r.id)).catch(() => undefined);
      changed = true;
    }
  }
  if (!mail.some((r) => r.notificationUrl === target && r.active !== false)) {
    await acc.createWebhook("/email/messages", target);
    changed = true;
  }
  return { changed };
}

/**
 * Incremental sync. If the newest stored mail is very old (the mailbox stopped
 * syncing long ago), start over from a fresh initial sync of the last
 * INITIAL_SYNC_DAYS instead of replaying months of changes in one request.
 */
export async function syncAccountNow(accountId: string, opts: { neverSynced?: boolean } = {}) {
  const newest = await db.email.findFirst({
    where: { thread: { accountId } },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  const stale =
    !!opts.neverSynced && (!newest || Date.now() - newest.sentAt.getTime() > RESET_AFTER_DAYS * 864e5);
  if (stale) {
    await db.account.update({ where: { id: accountId }, data: { nextDeltaToken: null } });
  }
  const acc = await Account.forId(accountId);
  await acc.syncEmails();
  await db.account.update({
    where: { id: accountId },
    data: { lastSyncedAt: new Date(), status: "active", statusMessage: null },
  });
}

/** Accounts (owned by the user) that are due a catch-up sync. */
export async function dueForSync(userId: string, accountIds: string[]) {
  return db.account.findMany({
    where: {
      id: { in: accountIds },
      userId,
      status: { not: "needs_reauth" },
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(Date.now() - STALE_MS) } }],
    },
    select: { id: true, lastSyncedAt: true },
  });
}

/**
 * Start catch-up syncs in the background (after the response is sent).
 * `lastSyncedAt` is bumped first as a short lease so parallel tabs or
 * instances don't start the same sync twice.
 */
export async function scheduleCatchUp(accounts: { id: string; lastSyncedAt: Date | null }[]) {
  if (!accounts.length) return 0;
  await db.account.updateMany({
    where: { id: { in: accounts.map((a) => a.id) } },
    data: { lastSyncedAt: new Date() },
  });
  waitUntil(
    Promise.allSettled(
      accounts.map(async (a) => {
        try {
          // First catch-up for an account: also repair its webhook subscription.
          if (!a.lastSyncedAt) {
            await ensureMailWebhook(a.id).catch((e) =>
              console.warn(`Webhook repair failed for ${a.id}:`, (e as Error).message),
            );
          }
          await syncAccountNow(a.id, { neverSynced: !a.lastSyncedAt });
        } catch (error) {
          const message = (error as Error).message;
          await db.account
            .update({
              where: { id: a.id },
              data:
                message === "TOKEN_EXPIRED"
                  ? { status: "needs_reauth", statusMessage: "Access expired or was revoked. Reconnect this account." }
                  : { status: "error", statusMessage: message.slice(0, 300) },
            })
            .catch(() => undefined);
          console.error(`Catch-up sync failed for ${a.id}:`, message);
        }
      }),
    ),
  );
  return accounts.length;
}
