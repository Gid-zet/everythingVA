import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { sendPush } from "@/server/tasks/notifications";
import { companyFromDomain, domainOf, FREE_EMAIL_DOMAINS } from "@/lib/leads/candidates";

/**
 * Public enquiry form endpoint. Guards: consent required, a honeypot field,
 * per-IP and per-form rate limits, size limits, and UTM / referrer capture
 * (the utm_form approach) so you know which campaign brought the lead.
 */

const body = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().toLowerCase().email().max(254),
  company: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(60).optional(),
  message: z.string().trim().max(5000).optional(),
  consent: z.literal(true),
  website: z.string().max(0).optional(), // honeypot: real people never fill it in
  attribution: z.record(z.string().max(60), z.string().max(500)).optional(),
});

const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "referrer", "landing"];
const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (limited(`ip:${ip}`, 5, 10 * 60_000)) return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });

  const form = await db.leadForm.findUnique({ where: { id: params.id } });
  if (!form?.active) return NextResponse.json({ error: "This form isn't accepting responses." }, { status: 404 });

  let parsed;
  try {
    parsed = body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!parsed.success) {
    const consent = parsed.error.issues.some((i) => i.path[0] === "consent");
    return NextResponse.json({ error: consent ? "Please tick the consent box." : "Please check your name and email." }, { status: 400 });
  }
  const input = parsed.data;
  // Honeypot filled: pretend success so bots learn nothing.
  if (input.website) return NextResponse.json({ ok: true, thankYou: form.thankYou });

  const recent = await db.lead.count({ where: { userId: form.userId, source: "form", sourceRef: form.id, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } } });
  if (recent >= 60) return NextResponse.json({ error: "This form is busy. Please try again later." }, { status: 429 });

  const attribution: Record<string, string> = {};
  for (const k of ATTRIBUTION_KEYS) {
    const v = input.attribution?.[k];
    if (v) attribution[k] = v.slice(0, 500);
  }
  const d = domainOf(input.email);
  const free = FREE_EMAIL_DOMAINS.has(d);
  const note = input.message ? `Enquiry: ${input.message}` : null;
  const existing = await db.lead.findUnique({ where: { userId_email: { userId: form.userId, email: input.email } } });
  let leadId: string;
  if (existing) {
    const u = await db.lead.update({
      where: { id: existing.id },
      data: {
        consent: true,
        stage: ["lost", "not_a_fit"].includes(existing.stage) ? "new" : existing.stage,
        notes: note ? [existing.notes, note].filter(Boolean).join("\n\n").slice(0, 10_000) : existing.notes,
        phone: existing.phone ?? input.phone ?? null,
        company: existing.company ?? input.company ?? null,
      },
    });
    leadId = u.id;
  } else {
    const created = await db.lead.create({
      data: {
        userId: form.userId,
        name: input.name,
        email: input.email,
        company: input.company || (free ? null : companyFromDomain(d)),
        domain: free ? null : d,
        phone: input.phone || null,
        notes: note,
        source: "form",
        sourceRef: form.id,
        sourceDetail: form.title,
        consent: true,
        attribution: Object.keys(attribution).length ? attribution : Prisma.DbNull,
      },
    });
    leadId = created.id;
  }
  await db.leadActivity.create({ data: { leadId, action: "form", summary: `Submitted “${form.title}”${attribution.utm_campaign ? ` (campaign ${attribution.utm_campaign})` : ""}` } });
  await db.leadForm.update({ where: { id: form.id }, data: { submissions: { increment: 1 } } });
  await sendPush(db, form.userId, { title: "New lead", body: `${input.name}${input.company ? ` · ${input.company}` : ""} filled in “${form.title}”`, url: "/leads", tag: `lead-${leadId}` }).catch(() => null);
  return NextResponse.json({ ok: true, thankYou: form.thankYou });
}
