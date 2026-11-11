import { db } from "@/server/db";
import { decryptSecret } from "@/server/security/crypto";

/**
 * Aurinko account tokens are long-lived: Aurinko refreshes the underlying
 * Google / Microsoft OAuth tokens itself, and its API has no token-refresh
 * endpoint. (The previous implementation called a non-existent
 * `/v1/auth/refresh` an hour after connecting, failed, and wiped the token,
 * breaking every account.) When the provider revokes access, Aurinko answers
 * 401; the provider layer then marks the account `needs_reauth` and the UI
 * offers a one-click reconnect.
 *
 * This returns the decrypted token, or null when the account must reconnect.
 */
export async function getValidToken(accountId: string): Promise<string | null> {
  const account = await db.account.findUnique({
    where: { id: accountId },
    select: { token: true, status: true },
  });
  if (!account || account.status === "needs_reauth") return null;
  try {
    return decryptSecret(account.token);
  } catch (error) {
    console.error(`Could not decrypt credentials for account ${accountId}`);
    return null;
  }
}
