import { getAccountDetails, getAurinkoToken } from "@/lib/aurinko";
import { waitUntil } from "@vercel/functions";
import { db } from "@/server/db";
import { getKindeUserForAPI } from "@/lib/kinde";
import { performInitialSync } from "@/lib/sync-actions";
import { type NextRequest, NextResponse } from "next/server";

export const GET = async (req: NextRequest) => {
  try {
    const user = await getKindeUserForAPI();
    // console.log("aurinko callback", user);
    if (!user?.id)
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const userId = user.id as string;

    const params = req.nextUrl.searchParams;
    const status = params.get("status");
    if (status !== "success")
      return NextResponse.json(
        { error: "Account connection failed" },
        { status: 400 },
      );

    const code = params.get("code");
    const token = await getAurinkoToken(code as string);
    // console.log("token", token);
    if (!token)
      return NextResponse.json(
        { error: "Failed to fetch token" },
        { status: 400 },
      );
    const accountDetails = await getAccountDetails(token.accessToken);

    // Calculate token expiration time
    const expiresIn = token.expiresIn || 3600; // Default to 1 hour
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // First, try to find an existing account by email address for this user
    // This handles re-authorization by updating the existing account instead of creating a new one
    const existingAccount = await db.account.findFirst({
      where: {
        userId,
        emailAddress: accountDetails.email,
      },
    });

    let accountId: string;
    
    if (existingAccount) {
      // Update existing account with new tokens (re-authorization)
      try {
        await db.account.update({
          where: { id: existingAccount.id },
          data: {
            token: token.accessToken,
            refreshToken: token.refreshToken || null,
            tokenExpiresAt,
            name: accountDetails.name, // Update name in case it changed
            nextDeltaToken: null, // Clear old delta token - it's invalid after re-authorization
          },
        });
        accountId = existingAccount.id;
        console.log(`Updated existing account ${accountId} for email ${accountDetails.email} (cleared delta token for fresh sync)`);
      } catch (updateError: any) {
        // If update fails due to unique constraint on token (unlikely but possible),
        // delete the old account and create a new one
        if (updateError?.code === 'P2002' && updateError?.meta?.target?.includes('token')) {
          console.warn("Token conflict detected, recreating account");
          await db.account.delete({ where: { id: existingAccount.id } });
          const newAccount = await db.account.create({
            data: {
              id: token.accountId.toString(),
              userId,
              token: token.accessToken,
              refreshToken: token.refreshToken || null,
              tokenExpiresAt,
              provider: "Aurinko",
              emailAddress: accountDetails.email,
              name: accountDetails.name,
            },
          });
          accountId = newAccount.id;
        } else {
          throw updateError;
        }
      }
    } else {
      // Create new account if it doesn't exist
      const newAccount = await db.account.create({
        data: {
          id: token.accountId.toString(),
          userId,
          token: token.accessToken,
          refreshToken: token.refreshToken || null,
          tokenExpiresAt,
          provider: "Aurinko",
          emailAddress: accountDetails.email,
          name: accountDetails.name,
        },
      });
      accountId = newAccount.id;
      console.log(`Created new account ${accountId} for email ${accountDetails.email}`);
    }
    waitUntil(
      performInitialSync(userId, accountId)
        .then((result) => {
          console.log("Initial sync result: success");
        })
        .catch((error) => {
          console.error("Initial sync error: failed");
        }),
    );

    return NextResponse.redirect(new URL("/mail", req.url));
  } catch (error) {
    console.error("Aurinko callback error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
};
