import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getKindeUserForAPI } from "@/lib/kinde";
import { db } from "@/server/db";
import { getMembership, hasRole } from "@/server/procurement/access";
import { audit } from "@/server/procurement/audit";
import { extractText, MAX_UPLOAD_BYTES } from "@/server/procurement/extract";
import { CATEGORY_LABELS } from "@/server/procurement/types";

export const maxDuration = 60;

const fields = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.enum(Object.keys(CATEGORY_LABELS) as [keyof typeof CATEGORY_LABELS, ...(keyof typeof CATEGORY_LABELS)[]]),
  expiresAt: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : null))
    .refine((d) => d === null || !Number.isNaN(d.getTime()), "Invalid expiry date"),
  previousVersionId: z.string().optional(),
});

/** Upload a knowledge-base document: extract its text and store it (optionally as a new version). */
export async function POST(req: NextRequest) {
  const user = await getKindeUserForAPI();
  if (!user?.id) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const ws = await getMembership(user.id);
  if (!hasRole(ws.role, "editor")) return NextResponse.json({ error: "You need the editor role to upload documents." }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Files must be 4 MB or smaller." }, { status: 413 });

  const parsed = fields.safeParse({
    name: form.get("name") || file.name.replace(/\.[^.]+$/, ""),
    category: form.get("category") || "other",
    expiresAt: (form.get("expiresAt") as string) || undefined,
    previousVersionId: (form.get("previousVersionId") as string) || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid details" }, { status: 400 });
  const input = parsed.data;

  let text: string;
  try {
    text = await extractText({ name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }

  let previous: { id: string; version: number; access: "all_members" | "admins_only" } | null = null;
  if (input.previousVersionId) {
    previous = await db.knowledgeDocument.findFirst({
      where: { id: input.previousVersionId, workspaceId: ws.workspaceId, isLatest: true },
      select: { id: true, version: true, access: true },
    });
    if (!previous) return NextResponse.json({ error: "The document to replace wasn't found." }, { status: 404 });
  }

  const doc = await db.$transaction(async (tx) => {
    if (previous) await tx.knowledgeDocument.update({ where: { id: previous.id }, data: { isLatest: false } });
    return tx.knowledgeDocument.create({
      data: {
        workspaceId: ws.workspaceId,
        name: input.name,
        category: input.category,
        fileName: file.name,
        mimeType: file.type || null,
        sizeBytes: file.size,
        text: text.slice(0, 500_000),
        uploadedBy: user.id,
        expiresAt: input.expiresAt,
        access: previous?.access ?? "all_members",
        version: previous ? previous.version + 1 : 1,
        previousVersionId: previous?.id,
      },
      select: { id: true, name: true, version: true },
    });
  });

  await audit({
    workspaceId: ws.workspaceId,
    actor: "user",
    userId: user.id,
    action: "document.uploaded",
    summary: `Uploaded ${doc.name}${doc.version > 1 ? ` (version ${doc.version})` : ""}: ${text.length.toLocaleString()} characters extracted`,
  });
  return NextResponse.json({ ...doc, characters: text.length });
}
