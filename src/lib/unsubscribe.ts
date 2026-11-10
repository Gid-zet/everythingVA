import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * RFC 2369 `List-Unsubscribe` / RFC 8058 `List-Unsubscribe-Post` handling.
 */

export interface UnsubscribeOptions {
  /** https URL from the header, if any. */
  url?: string;
  /** mailto target, if any. */
  mailto?: { to: string; subject: string; body: string };
  /** Sender advertises RFC 8058 one-click (POST without user interaction). */
  oneClick: boolean;
}

type Header = { name?: unknown; value?: unknown };

function header(headers: unknown[], name: string) {
  const h = (headers as Header[]).find(
    (x) => typeof x?.name === "string" && x.name.toLowerCase() === name,
  );
  return typeof h?.value === "string" ? h.value : undefined;
}

export function parseListUnsubscribe(headers: unknown[] | null | undefined): UnsubscribeOptions | null {
  if (!headers?.length) return null;
  const raw = header(headers, "list-unsubscribe");
  if (!raw) return null;

  const entries = [...raw.matchAll(/<([^>]+)>/g)].map((m) => m[1]!.trim());
  // Some senders omit the angle brackets.
  if (!entries.length) entries.push(...raw.split(",").map((s) => s.trim()));

  const out: UnsubscribeOptions = { oneClick: false };
  for (const entry of entries) {
    if (!out.url && /^https:\/\//i.test(entry)) out.url = entry;
    else if (!out.mailto && /^mailto:/i.test(entry)) {
      try {
        const u = new URL(entry);
        out.mailto = {
          to: decodeURIComponent(u.pathname),
          subject: u.searchParams.get("subject") ?? "Unsubscribe",
          body: u.searchParams.get("body") ?? "Please unsubscribe me from this list.",
        };
      } catch {
        // ignore malformed mailto
      }
    }
  }
  const post = header(headers, "list-unsubscribe-post");
  out.oneClick = !!out.url && !!post && /list-unsubscribe=one-click/i.test(post);
  return out.url || out.mailto ? out : null;
}

function isPrivateAddress(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * RFC 8058 one-click POST. The URL comes from an email header, i.e. it is
 * attacker-controlled, so refuse anything that resolves to a private network.
 */
export async function oneClickUnsubscribe(url: string): Promise<boolean> {
  const u = new URL(url);
  if (u.protocol !== "https:") return false;
  const { address } = await lookup(u.hostname);
  if (isPrivateAddress(address)) return false;

  const res = await fetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  return res.ok || (res.status >= 300 && res.status < 400);
}
