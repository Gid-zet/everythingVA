import "server-only";
import { TRPCError } from "@trpc/server";
import type { WorkspaceRole } from "@prisma/client";
import { db } from "@/server/db";

const RANK: Record<WorkspaceRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export function hasRole(role: WorkspaceRole, needed: WorkspaceRole) {
  return RANK[role] >= RANK[needed];
}

/**
 * The user's procurement workspace. A user who isn't in one gets their own
 * (as owner). If they belong to several, the one with a company profile wins,
 * then the oldest membership.
 */
export async function getMembership(userId: string) {
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { workspace: { select: { id: true, name: true, profile: { select: { id: true } } } } },
  });
  const chosen = memberships.find((m) => m.workspace.profile) ?? memberships[0];
  if (chosen) return { workspaceId: chosen.workspaceId, workspaceName: chosen.workspace.name, role: chosen.role };

  const user = await db.user.findUnique({ where: { id: userId }, select: { emailAddress: true } });
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  const workspace = await db.procurementWorkspace.create({
    data: { name: "My business", members: { create: { userId, role: "owner" } } },
  });
  await db.auditLog.create({
    data: { workspaceId: workspace.id, actor: "user", userId, action: "workspace.created", summary: "Created the procurement workspace" },
  });
  return { workspaceId: workspace.id, workspaceName: workspace.name, role: "owner" as WorkspaceRole };
}

export function requireRole(role: WorkspaceRole, needed: WorkspaceRole, what = "do this") {
  if (!hasRole(role, needed)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `You need the ${needed} role to ${what}.` });
  }
}
