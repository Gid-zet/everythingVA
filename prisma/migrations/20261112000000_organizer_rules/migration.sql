-- Organizer rules engine (rules, run history, auto-run setting). Additive and idempotent.

ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "organizerAutoRun" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN CREATE TYPE "RuleOperator" AS ENUM ('AND', 'OR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RuleRunStatus" AS ENUM ('APPLIED', 'SKIPPED', 'ERROR', 'UNDONE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RuleSystemType" AS ENUM ('TO_REPLY', 'NEWSLETTER', 'MARKETING', 'CALENDAR', 'RECEIPT', 'NOTIFICATION', 'COLD_EMAIL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "OrganizerRule" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0,
  "instructions" TEXT,
  "from" TEXT,
  "to" TEXT,
  "subject" TEXT,
  "body" TEXT,
  "conditionalOperator" "RuleOperator" NOT NULL DEFAULT 'AND',
  "systemType" "RuleSystemType",
  "actions" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizerRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizerRule_accountId_name_key" ON "OrganizerRule"("accountId", "name");
CREATE INDEX IF NOT EXISTS "OrganizerRule_accountId_enabled_idx" ON "OrganizerRule"("accountId", "enabled");
DO $$ BEGIN
  ALTER TABLE "OrganizerRule" ADD CONSTRAINT "OrganizerRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "RuleRun" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "ruleId" TEXT,
  "threadId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "status" "RuleRunStatus" NOT NULL,
  "reason" TEXT,
  "automated" BOOLEAN NOT NULL DEFAULT false,
  "actions" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RuleRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RuleRun_accountId_messageId_key" ON "RuleRun"("accountId", "messageId");
CREATE INDEX IF NOT EXISTS "RuleRun_accountId_createdAt_idx" ON "RuleRun"("accountId", "createdAt");
CREATE INDEX IF NOT EXISTS "RuleRun_ruleId_idx" ON "RuleRun"("ruleId");
DO $$ BEGIN
  ALTER TABLE "RuleRun" ADD CONSTRAINT "RuleRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RuleRun" ADD CONSTRAINT "RuleRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "OrganizerRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
