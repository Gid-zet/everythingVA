import type { NormalizedOpportunity } from "./types";

type Stored = {
  title: string;
  deadline: Date | null;
  amendmentNumber: string | null;
  description: string | null;
};

/**
 * What changed between the stored opportunity and a fresh copy from the
 * source. Used to detect amendments and moved deadlines.
 */
export function detectChanges(stored: Stored, incoming: NormalizedOpportunity) {
  const changes: string[] = [];
  const amended =
    !!incoming.amendmentNumber && incoming.amendmentNumber !== (stored.amendmentNumber ?? "") && incoming.amendmentNumber !== "000";
  if (amended) changes.push(`Amendment ${incoming.amendmentNumber} published`);

  const before = stored.deadline?.getTime() ?? null;
  const after = incoming.deadline?.getTime() ?? null;
  if (after !== null && before !== after) {
    changes.push(
      before === null
        ? `Deadline set to ${incoming.deadline!.toISOString()}`
        : `Deadline moved from ${stored.deadline!.toISOString()} to ${incoming.deadline!.toISOString()}`,
    );
  }
  if (incoming.title !== stored.title) changes.push(`Title changed to "${incoming.title}"`);
  if (incoming.description && stored.description && incoming.description !== stored.description && !amended) {
    changes.push("Description updated");
  }
  return { changed: changes.length > 0, amended, deadlineChanged: after !== null && before !== after, changes };
}
