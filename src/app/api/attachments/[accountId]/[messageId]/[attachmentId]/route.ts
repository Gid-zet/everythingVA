import { type NextRequest, NextResponse } from "next/server";
import { getKindeUserForAPI } from "@/lib/kinde";
import { db } from "@/server/db";
import { getProviders, ReauthRequiredError } from "@/server/providers";

/**
 * Stream an attachment from the provider after checking ownership.
 * `?inline=1` previews only types that are safe to render in the browser;
 * everything else (HTML, SVG, scripts…) is always forced to download so
 * attacker-controlled content can't run on our origin.
 */
const INLINE_SAFE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain"]);

export async function GET(
  req: NextRequest,
  { params }: { params: { accountId: string; messageId: string; attachmentId: string } },
) {
  const user = await getKindeUserForAPI();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await db.email.findFirst({
    where: { id: params.messageId, thread: { accountId: params.accountId, account: { userId: user.id } } },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const { mail } = await getProviders(params.accountId, user.id);
    const a = await mail.getAttachment(params.messageId, params.attachmentId);
    const mime = (a.mimeType || "application/octet-stream").toLowerCase().split(";")[0]!.trim();
    const inline = req.nextUrl.searchParams.get("inline") === "1" && INLINE_SAFE.has(mime);
    const safeName = a.name.replace(/[\r\n"\\]/g, "_");
    return new NextResponse(Buffer.from(a.content, "base64"), {
      headers: {
        "Content-Type": inline ? mime : "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(a.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    if (error instanceof ReauthRequiredError) {
      return NextResponse.json({ error: "Reconnect this account to download attachments." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not load the attachment from your mail provider." }, { status: 502 });
  }
}
