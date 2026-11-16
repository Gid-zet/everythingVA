import "server-only";
import type { AuditActor, Prisma } from "@prisma/client";
import { db } from "@/server/db";

/** Record an action. Never throws: a failed log line must not fail the action. */
export async function audit(entry: {
  workspaceId: string;
  actor: AuditActor;
  userId?: string | null;
  opportunityId?: string | null;
  action: string;
  summary: string;
  detail?: Prisma.InputJsonValue;
}) {
  await db.auditLog
    .create({
      data: {
        workspaceId: entry.workspaceId,
        actor: entry.actor,
        userId: entry.userId ?? null,
        opportunityId: entry.opportunityId ?? null,
        action: entry.action,
        summary: entry.summary.slice(0, 500),
        detail: entry.detail,
      },
    })
    .catch((e) => console.error("[procurement] audit log failed", e));
}
