/** Admin alerts about the knowledge base and credentials (pure; testable). */

export type Alert = { level: "warning" | "critical" | "info"; message: string; href?: string };

const DAY = 86400_000;

export function buildAlerts(input: {
  now: Date;
  hasProfile: boolean;
  credentials: { name: string; status: string; expiresAt: Date | null }[];
  documents: { name: string; category: string; expiresAt: Date | null; isLatest: boolean }[];
  samConfigured: boolean;
}): Alert[] {
  const alerts: Alert[] = [];
  const { now } = input;

  if (!input.hasProfile) {
    alerts.push({ level: "critical", message: "Set up the company profile so discovery knows what to look for.", href: "/procurement/profile" });
  }
  if (!input.samConfigured) {
    alerts.push({ level: "info", message: "SAM.gov search is off. Add a SAM_GOV_API_KEY to search US federal opportunities.", href: "/procurement/settings" });
  }

  for (const c of input.credentials) {
    if (c.expiresAt && c.expiresAt < now) {
      alerts.push({ level: "critical", message: `${c.name} expired on ${c.expiresAt.toDateString()}.`, href: "/procurement/profile" });
    } else if (c.expiresAt && c.expiresAt.getTime() - now.getTime() < 60 * DAY) {
      const days = Math.ceil((c.expiresAt.getTime() - now.getTime()) / DAY);
      alerts.push({ level: "warning", message: `${c.name} expires in ${days} day${days === 1 ? "" : "s"}.`, href: "/procurement/profile" });
    }
    if (c.status === "unverified") {
      alerts.push({ level: "warning", message: `${c.name} hasn't been verified. Agents won't treat it as held until it is.`, href: "/procurement/profile" });
    }
  }

  const latest = input.documents.filter((d) => d.isLatest);
  for (const d of latest) {
    if (d.expiresAt && d.expiresAt < now) {
      alerts.push({ level: "critical", message: `Document "${d.name}" expired on ${d.expiresAt.toDateString()}.`, href: "/procurement/knowledge" });
    } else if (d.expiresAt && d.expiresAt.getTime() - now.getTime() < 60 * DAY) {
      const days = Math.ceil((d.expiresAt.getTime() - now.getTime()) / DAY);
      alerts.push({ level: "warning", message: `Document "${d.name}" expires in ${days} day${days === 1 ? "" : "s"}.`, href: "/procurement/knowledge" });
    }
  }

  const essential: [string, string][] = [
    ["capability_statement", "capability statement"],
    ["insurance", "insurance certificate"],
    ["past_performance", "past performance records"],
  ];
  for (const [category, label] of essential) {
    if (!latest.some((d) => d.category === category)) {
      alerts.push({ level: "info", message: `The knowledge base has no ${label} yet.`, href: "/procurement/knowledge" });
    }
  }
  return alerts;
}
