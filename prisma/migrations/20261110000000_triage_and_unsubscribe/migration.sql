-- Provider-synced triage state (archive / trash / snooze) and bulk unsubscribe.
-- Additive only: safe to apply to a database created with `prisma db push`.

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "trashedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "snoozedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "EmailAddress" ADD COLUMN IF NOT EXISTS "unsubscribedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Thread_accountId_trashedAt_idx" ON "Thread"("accountId", "trashedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Thread_accountId_snoozedUntil_idx" ON "Thread"("accountId", "snoozedUntil");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Email_fromId_idx" ON "Email"("fromId");
