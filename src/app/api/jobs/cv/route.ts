import { NextResponse, type NextRequest } from "next/server";
import { getKindeUserForAPI } from "@/lib/kinde";
import { extractText, MAX_UPLOAD_BYTES } from "@/server/procurement/extract";

export const maxDuration = 30;

/** Turn an uploaded CV (PDF, Word or text) into plain text. Nothing is stored here. */
export async function POST(req: NextRequest) {
  const user = await getKindeUserForAPI();
  if (!user?.id) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Files must be 4 MB or smaller." }, { status: 413 });
  try {
    const text = await extractText({ name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    return NextResponse.json({ text: text.slice(0, 60_000), name: file.name.slice(0, 200) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read that file." }, { status: 400 });
  }
}
