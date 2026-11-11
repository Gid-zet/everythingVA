import { waitUntil } from "@vercel/functions";
import { type NextRequest, NextResponse } from "next/server";
import { getKindeUserForAPI } from "@/lib/kinde";
import { performInitialSync } from "@/lib/sync-actions";
import { verifyState } from "@/server/security/crypto";
import { exchangeCode, upsertConnectedAccount } from "@/server/services/accounts";

/** OAuth return from Aurinko. Verifies the signed state before trusting anything. */
export const GET = async (req: NextRequest) => {
  const done = (params: Record<string, string>) => {
    const url = new URL("/mail", req.url);
    url.searchParams.set("tab", "accounts");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return NextResponse.redirect(url);
  };

  const user = await getKindeUserForAPI();
  if (!user?.id) return NextResponse.redirect(new URL("/api/auth/login", req.url));

  const params = req.nextUrl.searchParams;
  const state = verifyState<{ u: string; r: string | null }>(params.get("state"));
  if (!state || state.u !== user.id) {
    return done({ connectError: "The connection request expired or did not come from this browser. Try again." });
  }
  if (params.get("status") !== "success") {
    const reason = params.get("error_description") ?? params.get("error") ?? "Permission was not granted.";
    return done({ connectError: reason.slice(0, 200) });
  }
  const code = params.get("code");
  if (!code) return done({ connectError: "The provider did not return an authorization code." });

  try {
    const token = await exchangeCode(code);
    const { accountId } = await upsertConnectedAccount(user.id, token);
    waitUntil(
      performInitialSync(user.id, accountId).catch((error) =>
        console.error(`Initial sync failed for ${accountId}:`, (error as Error).message),
      ),
    );
    return done({ connected: accountId });
  } catch (error) {
    console.error("Aurinko callback error:", (error as Error).message);
    return done({ connectError: error instanceof Error ? error.message : "Could not connect the account." });
  }
};
