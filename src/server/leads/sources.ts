import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getMembership } from "@/server/procurement/access";
import { companyFromDomain, domainOf, FREE_EMAIL_DOMAINS, isBulkSender, rankMailboxContacts, type Candidate, type ContactStats } from "@/lib/leads/candidates";

/**
 * Lead sources built on data the user already owns. Nothing here scrapes the
 * web or buys lists: warm contacts from the user's own mailbox, buyer contacts
 * from tenders they track, and people who fill in their enquiry form.
 */

const LOOKBACK_DAYS = 365;

export async function existingLeadEmails(db: PrismaClient, userId: string) {
  const rows = await db.lead.findMany({ where: { userId, email: { not: null } }, select: { email: true } });
  return new Set(rows.map((r) => r.email!.toLowerCase()));
}

/** People you've corresponded with over the last year, warmest first. */
export async function mailboxCandidates(db: PrismaClient, userId: string, limit = 60): Promise<Candidate[]> {
  const accounts = await db.account.findMany({ where: { userId }, select: { id: true, emailAddress: true } });
  if (!accounts.length) return [];
  const accountIds = accounts.map((a) => a.id);
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000);

  // Inbound: who writes to you (grouped by sender address row).
  const inbound = await db.$queryRaw<{ address: string; name: string | null; n: bigint; last: Date; subject: string | null; threadId: string | null; unsub: Date | null }[]>`
    SELECT ea."address", MAX(ea."name") AS name, COUNT(*)::bigint AS n, MAX(e."sentAt") AS last,
           (ARRAY_AGG(e."subject" ORDER BY e."sentAt" DESC))[1] AS subject,
           (ARRAY_AGG(e."threadId" ORDER BY e."sentAt" DESC))[1] AS "threadId",
           MAX(ea."unsubscribedAt") AS unsub
    FROM "Email" e
    JOIN "Thread" t ON t."id" = e."threadId"
    JOIN "EmailAddress" ea ON ea."id" = e."fromId"
    WHERE t."accountId" IN (${Prisma.join(accountIds)}) AND e."sentAt" >= ${since} AND e."emailLabel" <> 'sent'
    GROUP BY ea."address"
    ORDER BY n DESC
    LIMIT 800`;

  // Outbound: who you write to (recipients of your sent mail).
  const outbound = await db.$queryRaw<{ address: string; name: string | null; n: bigint; last: Date; subject: string | null; threadId: string | null }[]>`
    SELECT ea."address", MAX(ea."name") AS name, COUNT(*)::bigint AS n, MAX(e."sentAt") AS last,
           (ARRAY_AGG(e."subject" ORDER BY e."sentAt" DESC))[1] AS subject,
           (ARRAY_AGG(e."threadId" ORDER BY e."sentAt" DESC))[1] AS "threadId"
    FROM "Email" e
    JOIN "Thread" t ON t."id" = e."threadId"
    JOIN "_ToEmails" te ON te."A" = e."id"
    JOIN "EmailAddress" ea ON ea."id" = te."B"
    WHERE t."accountId" IN (${Prisma.join(accountIds)}) AND e."sentAt" >= ${since} AND e."emailLabel" = 'sent'
    GROUP BY ea."address"
    ORDER BY n DESC
    LIMIT 800`;

  const unsubscribed = new Set(inbound.filter((r) => r.unsub).map((r) => r.address.toLowerCase()));
  const rows: ContactStats[] = [
    ...inbound.map((r) => ({ email: r.address, name: r.name, emailsIn: Number(r.n), emailsOut: 0, lastContactAt: r.last, lastSubject: r.subject, threadId: r.threadId })),
    ...outbound.map((r) => ({ email: r.address, name: r.name, emailsIn: 0, emailsOut: Number(r.n), lastContactAt: r.last, lastSubject: r.subject, threadId: r.threadId })),
  ].filter((r) => !unsubscribed.has(r.email.toLowerCase()));

  const profile = await db.leadProfile.findUnique({ where: { userId }, select: { excludedDomains: true } });
  return rankMailboxContacts(rows, {
    ownAddresses: accounts.map((a) => a.emailAddress),
    excludedDomains: profile?.excludedDomains ?? [],
    existing: await existingLeadEmails(db, userId),
    now: new Date(),
  }).slice(0, limit);
}

type OppContact = { name?: string | null; email?: string | null; phone?: string | null };

/** Named buyer contacts on the tenders in your procurement workspace. */
export async function procurementCandidates(db: PrismaClient, userId: string, limit = 60): Promise<(Candidate & { phone: string | null; opportunityId: string })[]> {
  const { workspaceId } = await getMembership(userId);
  const opps = await db.opportunity.findMany({
    where: { workspaceId, contacts: { not: Prisma.DbNull } },
    orderBy: [{ fitScore: { sort: "desc", nulls: "last" } }, { discoveredAt: "desc" }],
    take: 300,
    select: { id: true, title: true, organization: true, contacts: true, fitScore: true, discoveredAt: true },
  });
  const existing = await existingLeadEmails(db, userId);
  const seen = new Set<string>();
  const out: (Candidate & { phone: string | null; opportunityId: string })[] = [];
  for (const o of opps) {
    const contacts = Array.isArray(o.contacts) ? (o.contacts as OppContact[]) : [];
    for (const c of contacts) {
      const email = c.email?.toLowerCase().trim();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || seen.has(email) || existing.has(email) || isBulkSender(email)) continue;
      seen.add(email);
      const domain = domainOf(email);
      out.push({
        email,
        name: c.name?.trim() || null,
        company: o.organization ?? (FREE_EMAIL_DOMAINS.has(domain) ? null : companyFromDomain(domain)),
        domain: FREE_EMAIL_DOMAINS.has(domain) ? null : domain,
        phone: c.phone?.trim() || null,
        emailsIn: 0,
        emailsOut: 0,
        lastContactAt: null,
        warmth: o.fitScore ?? 40,
        why: `Buyer contact on “${o.title.slice(0, 80)}”${o.fitScore != null ? ` · fit ${o.fitScore}` : ""}`,
        sourceRef: o.id,
        sourceDetail: o.title.slice(0, 300),
        opportunityId: o.id,
      });
    }
  }
  return out.slice(0, limit);
}

/** Recompute mailbox counts for one lead (used after import and on refresh). */
export async function mailboxStats(db: PrismaClient, userId: string, email: string) {
  const accounts = await db.account.findMany({ where: { userId }, select: { id: true } });
  if (!accounts.length) return null;
  const ids = accounts.map((a) => a.id);
  const [inn, out] = await Promise.all([
    db.email.aggregate({
      where: { thread: { accountId: { in: ids } }, emailLabel: { not: "sent" }, from: { address: { equals: email, mode: "insensitive" } } },
      _count: true,
      _max: { sentAt: true },
    }),
    db.email.aggregate({
      where: { thread: { accountId: { in: ids } }, emailLabel: "sent", to: { some: { address: { equals: email, mode: "insensitive" } } } },
      _count: true,
      _max: { sentAt: true },
    }),
  ]);
  const last = [inn._max.sentAt, out._max.sentAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
  return { emailsIn: inn._count, emailsOut: out._count, lastContactAt: last };
}

/** The latest messages with a lead, as plain text, for the AI to read. */
export async function recentCorrespondence(db: PrismaClient, userId: string, email: string, take = 4) {
  const emails = await db.email.findMany({
    where: {
      thread: { account: { userId } },
      OR: [{ from: { address: { equals: email, mode: "insensitive" } } }, { to: { some: { address: { equals: email, mode: "insensitive" } } } }],
    },
    orderBy: { sentAt: "desc" },
    take,
    select: { subject: true, sentAt: true, emailLabel: true, bodySnippet: true, body: true },
  });
  return emails
    .reverse()
    .map((e) => {
      const body = (e.body ?? e.bodySnippet ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 1200);
      return `<email direction="${e.emailLabel === "sent" ? "from you" : "from them"}" date="${e.sentAt.toISOString().slice(0, 10)}" subject="${e.subject.replace(/"/g, "'")}">\n${body}\n</email>`;
    })
    .join("\n");
}
