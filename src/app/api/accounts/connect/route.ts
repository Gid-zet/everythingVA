import { type NextRequest, NextResponse } from "next/server";
import { getKindeUserForAPI } from "@/lib/kinde";
import { db } from "@/server/db";
import { toServiceType } from "@/server/providers";
import { assertCanAddAccount, buildAuthorizeUrl, CONNECTABLE } from "@/server/services/accounts";

/**
 * Start connecting (or reconnecting) a mailbox.
 *   GET /api/accounts/connect?service=Google|Office365|iCloud|IMAP
 *   GET /api/accounts/connect?reconnect=<accountId>
 * Redirects to the provider's consent screen via Aurinko. Errors come back to
 * the accounts page as `?connectError=` so they can be shown inline.
 */
export async function GET(req: NextRequest) {
  const user = await getKindeUserForAPI();
  if (!user?.id) return NextResponse.redirect(new URL("/api/auth/login", req.url));

  const back = (message: string) => {
    const url = new URL("/mail", req.url);
    url.searchParams.set("tab", "accounts");
    url.searchParams.set("connectError", message);
    return NextResponse.redirect(url);
  };

  try {
    const reconnectId = req.nextUrl.searchParams.get("reconnect");
    if (reconnectId) {
      const account = await db.account.findFirst({
        where: { id: reconnectId, userId: user.id },
        select: { id: true, serviceType: true, emailAddress: true },
      });
      if (!account) return back("That account is not connected to you.");
      const serviceType = toServiceType(account.serviceType) ?? "Google";
      return NextResponse.redirect(
        await buildAuthorizeUrl({
          userId: user.id,
          serviceType,
          reconnectAccountId: account.id,
          loginHint: account.emailAddress,
        }),
      );
    }

    const serviceType = toServiceType(req.nextUrl.searchParams.get("service"));
    if (!serviceType || !CONNECTABLE.includes(serviceType)) return back("Choose a supported email provider.");
    await assertCanAddAccount(user.id);
    return NextResponse.redirect(await buildAuthorizeUrl({ userId: user.id, serviceType }));
  } catch (error) {
    return back(error instanceof Error ? error.message : "Could not start the connection.");
  }
}
