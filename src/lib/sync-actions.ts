import Account from "@/lib/account";
import { syncEmailsToDatabase } from "@/lib/sync-to-db";
import { db } from "@/server/db";
import { syncCalendarList } from "@/server/services/calendar-sync";

/**
 * First sync after an account is connected (runs in the background from the
 * OAuth callback). Status moves syncing -> active, or error with a message the
 * account settings page shows.
 */
export async function performInitialSync(userId: string, accountId: string) {
  const dbAccount = await db.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
  if (!dbAccount) throw new Error("ACCOUNT_NOT_FOUND");

  await db.account.update({ where: { id: accountId }, data: { status: "syncing", statusMessage: null } });
  try {
    const account = await Account.forId(accountId);
    try {
      await account.createSubscription();
    } catch (error) {
      // Webhooks are an optimisation; polling still keeps the inbox current.
      console.warn(`Could not register mail webhook for ${accountId}:`, (error as Error).message);
    }
    const response = await account.performInitialSync();
    if (!response) throw new Error("The first sync did not complete. Try syncing again.");

    await syncEmailsToDatabase(response.emails, accountId);
    await db.account.update({
      where: { id: accountId },
      data: { nextDeltaToken: response.deltaToken, status: "active", statusMessage: null, lastSyncedAt: new Date() },
    });

    // Calendars are optional (IMAP has none); failures don't fail the mail sync.
    await syncCalendarList(accountId).catch((error) =>
      console.warn(`Calendar list sync failed for ${accountId}:`, (error as Error).message),
    );
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    await db.account
      .update({
        where: { id: accountId },
        data:
          message === "TOKEN_EXPIRED"
            ? { status: "needs_reauth", statusMessage: "Access was revoked. Reconnect this account." }
            : { status: "error", statusMessage: message.slice(0, 300) },
      })
      .catch(() => undefined);
    throw error;
  }
}
