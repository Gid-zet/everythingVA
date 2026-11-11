import type { OrganizerRule } from "@prisma/client";
import type { RuleMessage } from "./types";

/**
 * Static matching, after Inbox Zero's matchesStaticRule:
 * - a pattern may list alternatives with "|" or " OR "
 * - "*" is a wildcard
 * - matching is case-insensitive substring unless a wildcard is used
 * - from/to match the address or the display name
 * Unset fields are ignored; every set field must match (AND within static).
 */
function alternatives(pattern: string) {
  return pattern
    .split(/\s*\|\s*|\s+OR\s+/i)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
}

function matchOne(pattern: string, text: string) {
  if (!pattern.includes("*")) return text.includes(pattern);
  const re = new RegExp(
    pattern
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*"),
    "i",
  );
  return re.test(text);
}

export function matchesPattern(pattern: string, ...texts: (string | null | undefined)[]) {
  const hay = texts.filter(Boolean).map((t) => t!.toLowerCase());
  return alternatives(pattern).some((p) => hay.some((t) => matchOne(p, t)));
}

type Rule = Pick<OrganizerRule, "from" | "to" | "subject" | "body" | "instructions" | "conditionalOperator">;

export function hasStatic(rule: Rule) {
  return !!(rule.from || rule.to || rule.subject || rule.body);
}

export function matchesStatic(rule: Rule, m: RuleMessage) {
  if (!hasStatic(rule)) return false;
  if (rule.from && !matchesPattern(rule.from, m.from.address, m.from.name)) return false;
  if (rule.to && !m.to.some((t) => matchesPattern(rule.to!, t.address, t.name))) return false;
  if (rule.subject && !matchesPattern(rule.subject, m.subject)) return false;
  if (rule.body && !matchesPattern(rule.body, m.text)) return false;
  return true;
}

/**
 * Combine static and AI conditions (Inbox Zero's evaluateRuleConditions):
 * - OR:  static match → matched; otherwise AI decides if instructions exist.
 * - AND: static must pass (if present); then AI decides if instructions exist.
 */
export function evaluate(rule: Rule, m: RuleMessage): { matched: boolean; needsAi: boolean } {
  const staticDefined = hasStatic(rule);
  const ai = !!rule.instructions?.trim();
  const staticOk = staticDefined && matchesStatic(rule, m);

  if (rule.conditionalOperator === "OR") {
    if (staticOk) return { matched: true, needsAi: false };
    return { matched: false, needsAi: ai };
  }
  if (staticDefined && !staticOk) return { matched: false, needsAi: false };
  if (ai) return { matched: false, needsAi: true };
  return { matched: staticOk, needsAi: false };
}
