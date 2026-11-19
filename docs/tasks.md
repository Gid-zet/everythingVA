# Tasks

A personal task manager inside everythingVA (`/tasks`, linked from the mail
sidebar), designed from what the leading tools do best:

| Idea | From |
|---|---|
| Status groups (backlog, to do, in progress, done, canceled), five priorities, per-user IDs (`T-12`), `completedAt` kept in sync with status, fractional `sortOrder` (append at max + 10000) | Linear / [Plane](https://github.com/makeplane/plane) (AGPL: concepts only, no code) |
| One-line natural-language quick add with live highlighting: dates, `every …` repeats, `p1`–`p4`, `#project`, `@label`, `30m` estimates | Todoist / [Super Productivity](https://github.com/super-productivity/super-productivity) (MIT), using [chrono-node](https://github.com/wanasit/chrono) (MIT) for dates |
| Inbox, Today (with Overdue), Upcoming (14 days by day) | Things / Todoist |
| Board (Kanban by status, drag between columns) | Linear / Trello |
| Repeating tasks advance to their next date when completed, skipping missed ones | Todoist |

everythingVA-specific:
- **From email:** "Add task" in the thread toolbar opens quick add prefilled with the subject. **Suggest tasks with AI** reads the thread and proposes action items (nothing is saved until you add one). Linked tasks show under the thread subject and link back to the email (`/mail?thread=…`).
- **Optimistic updates:** the UI changes instantly and syncs in the background; failures roll back.

## Quick add syntax

```
Send invoice to Acme friday 2pm p2 #Clients @finance 30m
Water plants every monday
Standup every weekday 9am
```

Dates are parsed in the browser, so they use your time zone. Due dates are
stored as calendar dates (`YYYY-MM-DD`) with an optional `HH:MM`, so "today"
and repeats never drift across time zones.

## Keyboard

`Q` new task · `B` list/board · `Esc` close the panel · `Space` on a focused row completes it.

## Code

- `src/lib/tasks/quick-add.ts`, `recurrence.ts`, `views.ts`: pure logic, unit-tested in `src/lib/tasks/__tests__`.
- `src/server/api/routers/tasks.ts`: tRPC API (every query is scoped to the signed-in user; thread links are checked against the user's own accounts).
- `src/app/tasks/**`: UI. All data access goes through `TaskStore` (`components/store.ts`).
- Migration `20261117100000_tasks`: new tables only (`Task`, `TaskProject`, `TaskActivity`).

## Not yet

Reminders/notifications, calendar time-blocking, sharing tasks with other users, manual reordering within a list (board columns and statuses are supported), and file attachments.

## Connected workflow

Anything can become a task, and the task links back to where it came from:

| From | How | Task gets |
|---|---|---|
| Email | Thread toolbar → **Add task** (quick add prefilled with the subject, or **Suggest tasks with AI**) | Link to the thread; chips under the subject |
| Calendar event | Event panel → **Add as task** | Due at the event's start; link back (`/calendar?date=…&event=…`) |
| Procurement opportunity | Opportunity page → **Add to my tasks** | Title "Bid: …", due at the response deadline, project "Procurement", high priority if fit ≥ 70 |

The calendar sidebar also lists the tasks due on the selected day, so you can tick them off or add one for that day.

## Gamification

Modelled on [Todoist Karma](https://todoist.com/help/articles/introduction-to-karma) (points, levels, daily and weekly goals, days off, vacation mode) and [Duolingo's streak](https://blog.duolingo.com/how-duolingo-streak-builds-habit) (a streak protected by freezes you earn). Gamification researchers argue streaks need forgiveness, because one broken streak makes people quit ([Yu-kai Chou](https://yukaichou.com/gamification-analysis/streak-design-gamification-motivation-burnout/)). So:

- **Points:**
  - Each completed task: 10, plus 8 / 5 / 3 / 1 by priority (urgent / high / medium / low).
  - +4 if done on time, and +2 if it came from an email, event or opportunity.
  - Daily goal: +25, plus 2 per streak day (up to 10). Weekly goal: +100.
  - Un-completing a task takes its points back. **No penalties for overdue tasks.**
- **10 levels**, from Starter to Enlightened, getting further apart.
- **Streaks:**
  - Days you hit your daily goal. Days off (default Saturday and Sunday) and vacation mode don't break them.
  - You earn a **freeze** every 7 goal days and can hold up to 2. A freeze covers a missed working day.
- **17 achievements:** milestones, streaks, on time, early bird, inbox zero, clean slate, and the connected ones ("Email tamer", "Meeting ready", "Bid builder").
- **Celebrations:** a points toast on each completion, confetti for goals and level-ups (none with reduced motion), and toasts for new badges. **Tasks → Progress** has the details, a 30-day chart and settings, including an off switch.

Rules: `src/lib/tasks/gamification.ts` (unit-tested). Server: `src/server/tasks/rewards.ts`. Data: `TaskCompletion`, `ProductivitySettings`, `UserAchievement` (migration `20261118000000_connect_and_gamify`).

## Reminders

- **Push notifications:** a pop-up on each device you allow (Tasks → Reminders → *Turn on for this device*), even when everythingVA isn't open.
  - Timed tasks remind you 30 minutes before by default.
  - Tasks with only a date remind you at 9 AM on the day.
  - Each task can override this: none, at the due time, 5 min to 1 day before.
  - Clicking the notification opens the task.
- **Morning email digest:** overdue, today and tomorrow, sent at 7 AM from your own connected mailbox to yourself. It's skipped when nothing is due. *Send today's digest now* sends one immediately.
- **Time zone:** taken from your browser, so reminders keep the right local time, including across daylight saving.
- **Recalculation:** reminder times update whenever a task's date, time, status or reminder changes. Completing or deleting a task cancels its reminder.

### Setup

1. **VAPID keys.** Generate them once: `npx web-push generate-vapid-keys`.
   - In Vercel, add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, and optionally `VAPID_SUBJECT` (your site URL or a `mailto:` address).
   - Keep the private key secret. Changing the keys means every device has to turn notifications on again.
2. **CRON_SECRET.** It should already be set for discovery.
3. **On-time reminders.** Vercel's free plan runs `/api/cron/reminders` once a day (12:00 UTC). That's enough for the digest, but push reminders would arrive late. For on-time reminders, either:
   - use a free scheduler such as [cron-job.org](https://cron-job.org): `GET https://<your-domain>/api/cron/reminders` every 5 minutes, with the header `Authorization: Bearer <CRON_SECRET>`; or
   - upgrade to Vercel Pro and change the schedule in `vercel.json` to `*/5 * * * *`.
4. **iPhone/iPad.** Web push needs iOS 16.4+ and the site added to the Home Screen (Share → Add to Home Screen), then turned on from that icon.

Code: `src/lib/tasks/reminders.ts` (timing and time zones, unit-tested), `src/server/tasks/notifications.ts` (push and digest), `src/app/api/cron/reminders/route.ts`, `public/sw.js` (service worker), `src/app/tasks/components/reminders-panel.tsx`.
