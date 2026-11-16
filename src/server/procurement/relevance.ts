import type { MatchProfile } from "./types";

/** Opportunities scoring below this are not stored. */
export const RELEVANCE_MIN = 30;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function contains(haystack: string, phrase: string) {
  return new RegExp(`(^| )${escape(phrase)}( |$)`).test(haystack);
}

/**
 * Cheap keyword relevance (0–100) used to rank and filter what discovery
 * stores. It is a first pass only; the qualification agent decides fit.
 *
 *  - phrase in the title: 30 points, in the description: 10
 *  - classification code match (NAICS exact, UNSPSC by prefix): 25 in total
 *    (codes are broad, e.g. 801015 also covers IT consulting, so a code alone
 *    stays below RELEVANCE_MIN and needs at least one keyword to be stored)
 *  - an excluded keyword in the title: score 0
 */
export function scoreRelevance(
  o: { title: string; description?: string | null; classificationCodes: string[] },
  p: MatchProfile,
): { score: number; matched: string[] } {
  const title = normalize(o.title);
  const body = normalize((o.description ?? "").slice(0, 20000));

  for (const ex of p.excludedKeywords.map(normalize).filter(Boolean)) {
    if (contains(title, ex)) return { score: 0, matched: [] };
  }

  const terms = Array.from(new Set([...p.keywords, ...p.services].map(normalize).filter((t) => t.length >= 3)));
  const matched: string[] = [];
  let points = 0;
  for (const t of terms) {
    if (contains(title, t)) {
      points += 30;
      matched.push(t);
    } else if (body && contains(body, t)) {
      points += 10;
      matched.push(t);
    }
  }

  let codeHit = false;
  const codes = o.classificationCodes.map((c) => c.trim()).filter(Boolean);
  for (const code of codes) {
    const hit =
      p.naicsCodes.includes(code) ||
      p.unspscCodes.some((u) => u.length >= 4 && code.startsWith(u.replace(/0+$/, "")));
    if (hit) {
      codeHit = true;
      matched.push(`code ${code}`);
    }
  }
  if (codeHit) points += 25;

  return { score: Math.min(100, points), matched };
}
