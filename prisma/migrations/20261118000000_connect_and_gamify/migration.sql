-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "eventCalendarId" TEXT,
ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "eventStart" TIMESTAMP(3),
ADD COLUMN     "opportunityId" TEXT;

-- CreateTable
CREATE TABLE "TaskCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'task',
    "localDate" TEXT NOT NULL,
    "localHour" INTEGER,
    "points" INTEGER NOT NULL,
    "onTime" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT,
    "source" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductivitySettings" (
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyGoal" INTEGER NOT NULL DEFAULT 5,
    "weeklyGoal" INTEGER NOT NULL DEFAULT 25,
    "daysOff" INTEGER[] DEFAULT ARRAY[0, 6]::INTEGER[],
    "vacation" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductivitySettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskCompletion_userId_localDate_idx" ON "TaskCompletion"("userId", "localDate");

-- CreateIndex
CREATE INDEX "TaskCompletion_taskId_idx" ON "TaskCompletion"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAchievement_userId_key_key" ON "UserAchievement"("userId", "key");

-- CreateIndex
CREATE INDEX "Task_userId_eventId_idx" ON "Task"("userId", "eventId");

-- CreateIndex
CREATE INDEX "Task_opportunityId_idx" ON "Task"("opportunityId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductivitySettings" ADD CONSTRAINT "ProductivitySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

