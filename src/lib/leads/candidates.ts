/**
 * Turning raw mailbox and procurement data into lead candidates (pure; tested).
 * Inspired by OpenOutreach: candidates come with a reason, and nothing is
 * contacted automatically. Here the "data provider" is data the user already
 * owns: their mailbox, the tenders they track and their own enquiry form.
 */

/** Consumer mailbox domains: the person may be a lead, but the domain isn't a company. */
export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "yahoo.co.uk", "ymail.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "zoho.com", "mail.com", "yandex.com",
]);

const BULK_LOCAL = /^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|alerts?|mailer-daemon|postmaster|bounce|bounces|news|newsletter|newsletters|marketing|updates?|digest|info|hello|support|help|billing|invoices?|receipts?|accounts?|team|admin|system|automated|calendar|feedback|security|privacy|jobs|careers|sales|reply|mail|email|service|services)([+._-].*)?$/i;
const BULK_DOMAIN = /(mailchimp|sendgrid|mailgun|amazonses|hubspot|marketo|salesforce|intercom|zendesk|freshdesk|substack|medium|linkedin|facebookmail|twitter|x\.com|google\.com|googlemail|microsoft\.com|apple\.com|github\.com|slack\.com|notion\.so|calendly|zoom\.us|docusign|stripe\.com|paypal|aurinko|vercel|canva|dropbox|atlassian|asana|trello|figma|shopify|amazon\.)/i;

export const domainOf = (email: string) => email.split("@")[1]?.toLowerCase().trim() ?? "";

/** True for automated or role mailboxes and bulk-sending platforms. */
export function isBulkSender(email: string) {
  const [local = "", domain = ""] = email.toLowerCase().split("@");
  return BULK_LOCAL.test(local) || BULK_DOMAIN.test(domain);
}

/** "northwind-traders.co.uk" → "Northwind Traders" (a best guess from the domain). */
export function companyFromDomain(domain: string) {
  const parts = domain.toLowerCase().split(".");
  if (parts.length < 2) return null;
  const twoPartTld = /^(co|com|org|net|gov|ac|edu)$/.test(parts[parts.length - 2]!) && parts.length >= 3;
  const core = parts[twoPartTld ? parts.length - 3 : parts.length - 2]!;
  if (!core || core.length < 2) return null;
  return core
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

export type ContactStats = {
  email: string;
  name: string | null;
  emailsIn: number;
  emailsOut: number;
  lastContactAt: Date | null;
  lastSubject?: string | null;
  threadId?: string | null;
};

export type Candidate = {
  email: string;
  name: string | null;
  company: string | null;
  domain: string | null;
  emailsIn: number;
  emailsOut: number;
  lastContactAt: Date | null;
  warmth: number;
  why: string;
  sourceRef?: string | null;
  sourceDetail?: string | null;
};

/**
 * Real people you've actually corresponded with, ranked by warmth:
 * two-way conversations first, then repeat senders, recent before old.
 */
export function rankMailboxContacts(
  rows: ContactStats[],
  opts: { ownAddresses: string[]; excludedDomains: string[]; existing: Set<string>; now: Date },
): Candidate[] {
  const own = new Set(opts.ownAddresses.map((a) => a.toLowerCase()));
  const ownDomains = new Set(opts.ownAddresses.map(domainOf).filter((d) => d && !FREE_EMAIL_DOMAINS.has(d)));
  const excluded = new Set(opts.excludedDomains.map((d) => d.toLowerCase().replace(/^@/, "")));
  const merged = new Map<string, ContactStats>();
  for (const r of rows) {
    const email = r.email.toLowerCase().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    const prev = merged.get(email);
    if (!prev) merged.set(email, { ...r, email });
    else
      merged.set(email, {
        ...prev,
        name: prev.name ?? r.name,
        emailsIn: prev.emailsIn + r.emailsIn,
        emailsOut: prev.emailsOut + r.emailsOut,
        lastContactAt: !prev.lastContactAt || (r.lastContactAt && r.lastContactAt > prev.lastContactAt) ? r.lastContactAt : prev.lastContactAt,
        lastSubject: !prev.lastContactAt || (r.lastContactAt && r.lastContactAt > prev.lastContactAt) ? r.lastSubject : prev.lastSubject,
        threadId: !prev.lastContactAt || (r.lastContactAt && r.lastContactAt > prev.lastContactAt) ? r.threadId : prev.threadId,
      });
  }
  const out: Candidate[] = [];
  for (const r of merged.values()) {
    const domain = domainOf(r.email);
    if (own.has(r.email) || ownDomains.has(domain) || excluded.has(domain) || opts.existing.has(r.email)) continue;
    if (isBulkSender(r.email)) continue;
    // Someone who only ever wrote once and never got a reply is usually noise.
    if (r.emailsOut === 0 && r.emailsIn < 2) continue;
    const days = r.lastContactAt ? (opts.now.getTime() - r.lastContactAt.getTime()) / 86400_000 : 999;
    const recency = days < 30 ? 6 : days < 90 ? 3 : days < 365 ? 1 : 0;
    const warmth = Math.min(100, r.emailsOut * 6 + r.emailsIn * 3 + recency * 4 + (r.emailsOut && r.emailsIn ? 15 : 0));
    const free = FREE_EMAIL_DOMAINS.has(domain);
    const why = [
      r.emailsOut && r.emailsIn ? "Two-way conversation" : r.emailsOut ? "You've written to them" : "Writes to you repeatedly",
      `${r.emailsIn} in / ${r.emailsOut} out`,
      r.lastContactAt ? `last ${Math.round(days)} days ago` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    out.push({
      email: r.email,
      name: r.name?.trim() || null,
      company: free ? null : companyFromDomain(domain),
      domain: free ? null : domain,
      emailsIn: r.emailsIn,
      emailsOut: r.emailsOut,
      lastContactAt: r.lastContactAt,
      warmth,
      why,
      sourceRef: r.threadId ?? null,
      sourceDetail: r.lastSubject ?? null,
    });
  }
  return out.sort((a, b) => b.warmth - a.warmth || (b.lastContactAt?.getTime() ?? 0) - (a.lastContactAt?.getTime() ?? 0));
}

/** CSV import: map common header spellings to lead fields. */
const HEADER_MAP: Record<string, keyof ImportRow> = {
  name: "name", "full name": "name", fullname: "name", contact: "name",
  email: "email", "e-mail": "email", "email address": "email", mail: "email",
  company: "company", organisation: "company", organization: "company", account: "company", "company name": "company",
  title: "title", "job title": "title", role: "title", position: "title",
  phone: "phone", telephone: "phone", mobile: "phone",
  website: "website", url: "website", domain: "website",
  location: "location", city: "location", country: "location",
  notes: "notes", note: "notes", comments: "notes",
};
export type ImportRow = { name?: string; email?: string; company?: string; title?: string; phone?: string; website?: string; location?: string; notes?: string };

export function mapImportRows(rows: Record<string, string>[]): ImportRow[] {
  return rows
    .map((r) => {
      const out: ImportRow = {};
      for (const [k, v] of Object.entries(r)) {
        const key = HEADER_MAP[k.trim().toLowerCase()];
        if (key && v?.trim() && !out[key]) out[key] = v.trim().slice(0, 500);
      }
      if (out.email) out.email = out.email.toLowerCase();
      if (out.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) delete out.email;
      return out;
    })
    .filter((r) => r.email || (r.name && r.company));
}
