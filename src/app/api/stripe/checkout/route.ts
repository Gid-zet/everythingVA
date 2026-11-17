import { type NextRequest, NextResponse } from "next/server";

/**
 * Stripe's return URL after checkout. The subscription itself is recorded by
 * the signed webhook (api/stripe/webhook), which is the only trusted source;
 * this route just sends the user back to the app. It used to write the
 * subscription from the `session_id` query parameter, which anyone could
 * replay, and it failed because `currentPeriodEnd` was never set.
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/mail", request.url));
}
