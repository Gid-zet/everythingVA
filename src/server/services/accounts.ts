import "server-only";
import axios from "axios";
import { db } from "@/server/db";
import { getSubscriptionStatus } from "@/lib/stripe-actions";
import { FREE_ACCOUNTS_PER_USER, PRO_ACCOUNTS_PER_USER } from "@/app/constants";
import { decryptSecret, encryptSecret, signState } from "@/server/security/crypto";
import { AURINKO_API } from "@/server/providers/aurinko/http";
import { toServiceType, type ServiceType } from "@/server/providers";

/** Services a user can pick in "Connect account". */
export const CONNECTABLE: ServiceType[] = ["Google", "Office365", "iCloud", "IMAP"];

/**
 * Aurinko scopes. Mail.Send / Mail.Drafts are required for sending and draft
 * sync (they were missing before, so sending relied on provider defaults).
 */
const SCOPES = "Mail.Read Mail.ReadWrite Mail.Send Mail.Drafts Calendar.Read Calendar.ReadWrite";

export function appUrl() {
  const url = process.env.NEXT_PUBLIC_URL;
  if (!url) throw new Error("NEXT_PUBLIC_URL is not set");
  return url.replace(/\/$/, "");
}

export async function assertCanAddAccount(userId: string) {
  const [user, count] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { role: true } }),
    db.account.count({ where: { userId } }),
  ]);
  if (!user) throw new Error("User not found");
  if (user.role === "admin") return;
  const limit = (await getSubscriptionStatus()) ? PRO_ACCOUNTS_PER_USER : FREE_ACCOUNTS_PER_USER;
  if (count >= limit) {
    throw new Error(`Your plan allows ${limit} connected accounts. Disconnect one or upgrade to add more.`);
  }
}

/**
 * Build the Aurinko authorize URL. `state` is HMAC-signed and bound to the
 * user, so the callback can reject forged or replayed callbacks (CSRF).
 * Passing `reconnect` re-authorizes the same Aurinko account in place.
 */
export async function buildAuthorizeUrl(opts: {
  userId: string;
  serviceType: ServiceType;
  reconnectAccountId?: string;
  loginHint?: string;
}) {
  const params = new URLSearchParams({
    clientId: process.env.AURINKO_CLIENT_ID as string,
    serviceType: opts.serviceType,
    responseType: "code",
    returnUrl: `${appUrl()}/api/aurinko/callback`,
    scopes: SCOPES,
    state: signState({ u: opts.userId, r: opts.reconnectAccountId ?? null }),
  });
  if (opts.reconnectAccountId && /^\d+$/.test(opts.reconnectAccountId)) {
    params.set("accountId", opts.reconnectAccountId);
  }
  if (opts.loginHint) params.set("loginHint", opts.loginHint);
  return `${AURINKO_API}/auth/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string) {
  const { data } = await axios.post<{ accountId: number; accessToken: string; refreshToken?: string; expiresIn?: number }>(
    `${AURINKO_API}/auth/token/${encodeURIComponent(code)}`,
    {},
    { auth: { username: process.env.AURINKO_CLIENT_ID as string, password: process.env.AURINKO_CLIENT_SECRET as string } },
  );
  return data;
}

export async function fetchAccountInfo(accessToken: string) {
  const { data } = await axios.get<{
    email?: string;
    mailboxAddress?: string;
    name?: string;
    serviceType?: string;
    tokenStatus?: string;
    tokenError?: string;
  }>(`${AURINKO_API}/account`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return {
    email: data.mailboxAddress ?? data.email ?? "",
    name: data.name ?? data.email ?? "",
    serviceType: toServiceType(data.serviceType),
    tokenStatus: data.tokenStatus,
    tokenError: data.tokenError,
  };
}

/** Insert or update the account row after a successful OAuth exchange. */
export async function upsertConnectedAccount(userId: string, token: Awaited<ReturnType<typeof exchangeCode>>) {
  const info = await fetchAccountInfo(token.accessToken);
  const id = token.accountId.toString();

  // Aurinko ids are stable per mailbox; never let one user claim another's row.
  const existingById = await db.account.findUnique({ where: { id }, select: { userId: true } });
  if (existingById && existingById.userId !== userId) {
    throw new Error("This mailbox is already connected to a different EverythingVA user.");
  }
  const existingByEmail = existingById
    ? null
    : await db.account.findFirst({ where: { userId, emailAddress: info.email }, select: { id: true } });

  const data = {
    token: encryptSecret(token.accessToken)!,
    refreshToken: encryptSecret(token.refreshToken ?? null),
    tokenExpiresAt: null,
    provider: "Aurinko",
    serviceType: info.serviceType,
    emailAddress: info.email,
    name: info.name,
    status: "syncing" as const,
    statusMessage: null,
  };

  if (existingById) {
    await db.account.update({ where: { id }, data: { ...data, nextDeltaToken: null } });
    return { accountId: id, created: false };
  }
  if (existingByEmail) {
    // Re-authorized as a new Aurinko account: keep the user's data, swap credentials.
    await db.account.update({ where: { id: existingByEmail.id }, data: { ...data, nextDeltaToken: null } });
    return { accountId: existingByEmail.id, created: false };
  }
  await db.account.create({ data: { id, userId, ...data } });
  return { accountId: id, created: true };
}

/**
 * Disconnect: revoke the Aurinko account (stops provider access and webhooks)
 * and delete everything stored for it. Mail and events stay in the user's
 * mailbox; only our copy is removed.
 */
export async function disconnectAccount(userId: string, accountId: string) {
  const account = await db.account.findFirst({ where: { id: accountId, userId }, select: { id: true, token: true } });
  if (!account) throw new Error("Account not found");

  const token = (() => {
    try {
      return decryptSecret(account.token);
    } catch {
      return null;
    }
  })();
  if (token) {
    await axios
      .delete(`${AURINKO_API}/account`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15_000 })
      .catch((e) => console.warn(`Aurinko account delete failed for ${accountId}:`, (e as Error).message));
  }

  await db.$transaction(async (tx) => {
    const threads = await tx.thread.findMany({ where: { accountId }, select: { id: true } });
    const threadIds = threads.map((t) => t.id);
    const emails = await tx.email.findMany({ where: { threadId: { in: threadIds } }, select: { id: true } });
    const emailIds = emails.map((e) => e.id);
    await tx.emailClassification.deleteMany({ where: { emailId: { in: emailIds } } });
    await tx.emailAttachment.deleteMany({ where: { emailId: { in: emailIds } } });
    await tx.email.deleteMany({ where: { id: { in: emailIds } } });
    await tx.thread.deleteMany({ where: { id: { in: threadIds } } });
    await tx.emailAddress.deleteMany({ where: { accountId } });
    const calendars = await tx.calendar.findMany({ where: { accountId }, select: { id: true } });
    const calendarIds = calendars.map((c) => c.id);
    const events = await tx.calendarEvent.findMany({ where: { calendarId: { in: calendarIds } }, select: { id: true } });
    const eventIds = events.map((e) => e.id);
    await tx.eventException.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.calendarEvent.updateMany({ where: { id: { in: eventIds } }, data: { masterEventId: null } });
    await tx.calendarEvent.deleteMany({ where: { id: { in: eventIds } } });
    await tx.calendar.deleteMany({ where: { id: { in: calendarIds } } });
    await tx.draft.deleteMany({ where: { accountId } });
    await tx.ruleRun.deleteMany({ where: { accountId } });
    await tx.organizerRule.deleteMany({ where: { accountId } });
    await tx.account.delete({ where: { id: accountId } });
  }, { timeout: 60_000 });
}

/** Ask Aurinko whether the stored credentials still work, and record it. */
export async function checkAccountHealth(accountId: string) {
  const account = await db.account.findUnique({ where: { id: accountId }, select: { token: true } });
  const token = account ? decryptSecret(account.token) : null;
  if (!token) return "needs_reauth" as const;
  try {
    const info = await fetchAccountInfo(token);
    const healthy = !info.tokenStatus || info.tokenStatus.toLowerCase() === "active" || info.tokenStatus.toLowerCase() === "ok";
    await db.account.update({
      where: { id: accountId },
      data: healthy
        ? { serviceType: info.serviceType ?? undefined }
        : { status: "needs_reauth", statusMessage: info.tokenError ?? "The provider rejected our access. Reconnect this account." },
    });
    return healthy ? ("active" as const) : ("needs_reauth" as const);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      await db.account.update({
        where: { id: accountId },
        data: { status: "needs_reauth", statusMessage: "Access was revoked or expired. Reconnect this account." },
      });
      return "needs_reauth" as const;
    }
    throw error;
  }
}
