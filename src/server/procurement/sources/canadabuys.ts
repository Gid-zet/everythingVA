import { parseCsv } from "../csv";
import type { NormalizedOpportunity } from "../types";

/**
 * CanadaBuys open data: every open federal tender notice, as one CSV
 * (about 6 MB, refreshed daily). No key needed. Provincial and municipal
 * tenders are not included.
 */
export const CANADABUYS_OPEN_TENDERS_URL =
  "https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv";

/** Column lookup by the English part of CanadaBuys' bilingual headers. */
function col(row: Record<string, string>, key: string) {
  const keys = Object.keys(row);
  const exact = keys.find((k) => k === key);
  const eng = keys.find((k) => k.startsWith(`${key}-`) && k.endsWith("-eng"));
  const any = keys.find((k) => k.startsWith(`${key}-`) || k === key);
  return (row[exact ?? eng ?? any ?? ""] ?? "").trim();
}

function date(value: string) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const list = (value: string) =>
  value
    .split(/[\n,]+/)
    .map((v) => v.replace(/^\*/, "").trim())
    .filter(Boolean);

export function mapCanadaBuysRow(row: Record<string, string>): NormalizedOpportunity | null {
  const reference = col(row, "referenceNumber");
  const title = col(row, "title");
  const url = col(row, "noticeURL");
  if (!reference || !title) return null;

  const regions = [...list(col(row, "regionsOfDelivery")), ...list(col(row, "regionsOfOpportunity"))];
  const attachments = col(row, "attachment")
    .split(/\s+/)
    .filter((u) => u.startsWith("http"))
    .map((u) => ({ url: u, name: decodeURIComponent(u.split("/").pop() ?? "") || undefined }));
  const contactName = col(row, "contactInfoName");
  const contactEmail = col(row, "contactInfoEmail");
  const contactPhone = col(row, "contactInfoPhone");

  return {
    source: "canadabuys",
    externalId: reference,
    title,
    organization: col(row, "contractingEntityName") || undefined,
    referenceNumber: reference,
    solicitationNumber: col(row, "solicitationNumber") || undefined,
    noticeType: col(row, "noticeType") || col(row, "procurementMethod") || undefined,
    sourceUrl: url || `https://canadabuys.canada.ca/en/tender-opportunities`,
    postedAt: date(col(row, "publicationDate")),
    deadline: date(col(row, "tenderClosingDate")),
    currency: "CAD",
    country: "CA",
    placeOfPerformance: Array.from(new Set(regions)).join(", ") || undefined,
    classificationCodes: [...list(col(row, "unspsc")), ...list(col(row, "gsin"))],
    description: [col(row, "tenderDescription"), col(row, "unspscDescription"), col(row, "gsinDescription")]
      .filter(Boolean)
      .join("\n\n"),
    attachments,
    contacts: contactName || contactEmail || contactPhone ? [{ name: contactName || undefined, email: contactEmail || undefined, phone: contactPhone || undefined }] : [],
    amendmentNumber: col(row, "amendmentNumber") || undefined,
  };
}

export async function fetchCanadaBuysOpenTenders(): Promise<{ items: NormalizedOpportunity[]; scanned: number }> {
  // The open-data host rejects clients without a browser-style User-Agent; this
  // is the standard "compatible" bot form and still identifies us as a bot.
  const res = await fetch(CANADABUYS_OPEN_TENDERS_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; procurement-discovery/1.0)", Accept: "text/csv" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`CanadaBuys returned ${res.status}`);
  const rows = parseCsv(await res.text());
  const items = rows.map(mapCanadaBuysRow).filter((o): o is NormalizedOpportunity => !!o);
  return { items, scanned: rows.length };
}
