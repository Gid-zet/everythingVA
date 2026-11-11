import "server-only";
import { TRPCError } from "@trpc/server";
import { db } from "@/server/db";
import { decryptSecret } from "@/server/security/crypto";
import { aurinkoClient } from "./aurinko/http";
import { aurinkoMail } from "./aurinko/mail";
import { aurinkoCalendar } from "./aurinko/calendar";
import { ReauthRequiredError, type CalendarProvider, type MailProvider, type ServiceType } from "./types";

export * from "./types";

const SERVICE_TYPES: ServiceType[] = ["Google", "Office365", "EWS", "IMAP", "iCloud"];

export function toServiceType(v: string | null | undefined): ServiceType | null {
  return SERVICE_TYPES.includes(v as ServiceType) ? (v as ServiceType) : null;
}

export async function markNeedsReauth(accountId: string, message?: string) {
  await db.account
    .update({
      where: { id: accountId },
      data: { status: "needs_reauth", statusMessage: message ?? "Access was revoked or expired. Reconnect to resume sync." },
    })
    .catch(() => undefined);
}

export async function markHealthy(accountId: string) {
  await db.account
    .update({ where: { id: accountId }, data: { status: "active", statusMessage: null, lastSyncedAt: new Date() } })
    .catch(() => undefined);
}

/**
 * Resolve an account the caller owns into provider adapters.
 * `userId` is required for anything reachable from a request so one user can
 * never act on another user's account. Webhooks/background jobs pass `null`
 * after they have authenticated the caller in another way (e.g. HMAC).
 */
export async function getProviders(accountId: string, userId: string | null) {
  const account = await db.account.findFirst({
    where: { id: accountId, ...(userId ? { userId } : {}) },
    select: {
      id: true,
      userId: true,
      token: true,
      provider: true,
      serviceType: true,
      status: true,
      emailAddress: true,
      name: true,
    },
  });
  if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
  if (account.status === "needs_reauth") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `${account.emailAddress} needs to be reconnected before this action can run.`,
    });
  }
  const token = decryptSecret(account.token);
  if (!token) {
    await markNeedsReauth(account.id);
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${account.emailAddress} needs to be reconnected.` });
  }

  // Only Aurinko is implemented today; the switch is where direct adapters plug in.
  const client = aurinkoClient(token, () => markNeedsReauth(account.id));
  const serviceType = toServiceType(account.serviceType);
  const mail: MailProvider = aurinkoMail(client, serviceType);
  const calendar: CalendarProvider = aurinkoCalendar(client);

  return {
    account: { id: account.id, userId: account.userId, emailAddress: account.emailAddress, name: account.name, serviceType },
    mail,
    calendar,
  };
}

/** Convert provider auth failures into a clear tRPC error for the UI. */
export function asTRPCError(error: unknown, fallback = "The email provider rejected the request."): TRPCError {
  if (error instanceof TRPCError) return error;
  if (error instanceof ReauthRequiredError) {
    return new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : fallback,
  });
}
