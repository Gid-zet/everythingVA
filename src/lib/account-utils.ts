import { db } from "@/server/db";

/**
 * Check if an account needs re-authentication
 */
export async function checkAccountAuthStatus(
  accountId: string,
  userId: string,
): Promise<{
  needsReauth: boolean;
  account?: { id: string; emailAddress: string; name: string; provider: string };
}> {
  try {
    // Scoped to the caller, and the token itself never leaves the server.
    const account = await db.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true, token: true, emailAddress: true, name: true, provider: true, status: true },
    });
    if (!account) return { needsReauth: true };
    const { token, status, ...safe } = account;
    return { needsReauth: !token?.trim() || status === "needs_reauth", account: safe };
  } catch (error) {
    console.error("Error checking account auth status:", error);
    return { needsReauth: true };
  }
}

/**
 * Mark account as needing re-authentication
 */
export async function markAccountForReauth(accountId: string): Promise<void> {
  try {
    await db.account.update({
      where: { id: accountId },
      data: { token: "" },
    });
  } catch (error) {
    console.error("Error marking account for reauth:", error);
  }
}

/**
 * Get all accounts for a user
 */
export async function getUserAccounts(userId: string) {
  try {
    return await db.account.findMany({
      where: { userId },
      select: {
        id: true,
        emailAddress: true,
        name: true,
        provider: true,
        token: true,
      },
    });
  } catch (error) {
    console.error("Error getting user accounts:", error);
    return [];
  }
}
