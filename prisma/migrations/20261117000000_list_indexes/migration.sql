-- Folder lists: WHERE accountId = ? ... ORDER BY lastMessageDate DESC
CREATE INDEX IF NOT EXISTS "Thread_accountId_lastMessageDate_idx" ON "public"."Thread"("accountId", "lastMessageDate" DESC);

-- Thread view: emails of a thread in date order. Replaces the plain threadId
-- index (the new one covers the same lookups), created first so there's no gap.
CREATE INDEX IF NOT EXISTS "Email_threadId_sentAt_idx" ON "public"."Email"("threadId", "sentAt");
DROP INDEX IF EXISTS "public"."Email_threadId_idx";
