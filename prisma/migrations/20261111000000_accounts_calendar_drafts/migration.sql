-- Multi-provider accounts, connection health, calendar visibility, drafts,
-- starred/spam threads and cached AI summaries. Additive and idempotent.

-- Account: tokens are no longer globally unique (they are encrypted with a
-- random IV, and accounts awaiting re-auth used to collide on "").
DROP INDEX IF EXISTS "Account_token_key";

DO $$ BEGIN
  CREATE TYPE "AccountStatus" AS ENUM ('active', 'syncing', 'needs_reauth', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Account"
  ADD COLUMN IF NOT EXISTS "serviceType" TEXT,
  ADD COLUMN IF NOT EXISTS "status" "AccountStatus" NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "statusMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");

-- Accounts previously marked for re-auth by blanking the token
UPDATE "Account" SET "status" = 'needs_reauth' WHERE "token" = '';

-- Thread
ALTER TABLE "Thread"
  ADD COLUMN IF NOT EXISTS "spamAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "starred" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "summary" TEXT,
  ADD COLUMN IF NOT EXISTS "summaryUpdatedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Thread_accountId_starred_idx" ON "Thread"("accountId", "starred");

-- Calendar: provider ids are unique per account, not globally
DROP INDEX IF EXISTS "Calendar_aurinkoCalendarId_key";
ALTER TABLE "Calendar"
  ADD COLUMN IF NOT EXISTS "accessRole" TEXT,
  ADD COLUMN IF NOT EXISTS "isVisible" BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS "Calendar_accountId_aurinkoCalendarId_key" ON "Calendar"("accountId", "aurinkoCalendarId");

-- Drafts
CREATE TABLE IF NOT EXISTS "Draft" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "threadId" TEXT,
  "mode" TEXT NOT NULL DEFAULT 'new',
  "subject" TEXT NOT NULL DEFAULT '',
  "body" TEXT NOT NULL DEFAULT '',
  "to" JSONB NOT NULL DEFAULT '[]',
  "cc" JSONB NOT NULL DEFAULT '[]',
  "bcc" JSONB NOT NULL DEFAULT '[]',
  "inReplyTo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Draft_accountId_updatedAt_idx" ON "Draft"("accountId", "updatedAt");
DO $$ BEGIN
  ALTER TABLE "Draft" ADD CONSTRAINT "Draft_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
