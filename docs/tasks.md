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
