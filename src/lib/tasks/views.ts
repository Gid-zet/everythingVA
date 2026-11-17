import { addDays } from "./recurrence";

/** The fields views need (a subset of the API's task). */
export type TaskLike = {
  id: string;
  status: "backlog" | "todo" | "in_progress" | "done" | "canceled";
  priority: "none" | "low" | "medium" | "high" | "urgent";
  dueDate: string | null;
  dueTime: string | null;
  projectId: string | null;
  labels: string[];
  parentId: string | null;
  sortOrder: number;
  completedAt: Date | string | null;
};

export const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 } as const;
export const isOpen = (t: TaskLike) => t.status !== "done" && t.status !== "canceled";

/** Timed first (by time), then priority, then manual order. */
export function compareTasks(a: TaskLike, b: TaskLike) {
  if (a.dueDate !== b.dueDate) return (a.dueDate ?? "9999") < (b.dueDate ?? "9999") ? -1 : 1;
  if (a.dueTime !== b.dueTime) return (a.dueTime ?? "99") < (b.dueTime ?? "99") ? -1 : 1;
  if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  return a.sortOrder - b.sortOrder;
}

export type Group<T> = { key: string; label: string; tasks: T[] };

export function todayView<T extends TaskLike>(tasks: T[], today: string): Group<T>[] {
  const open = tasks.filter((t) => isOpen(t) && t.dueDate && t.dueDate <= today);
  return [
    { key: "overdue", label: "Overdue", tasks: open.filter((t) => t.dueDate! < today).sort(compareTasks) },
    { key: "today", label: "Today", tasks: open.filter((t) => t.dueDate === today).sort(compareTasks) },
  ].filter((g) => g.tasks.length || g.key === "today");
}

export function upcomingView<T extends TaskLike>(tasks: T[], today: string, days = 14): Group<T>[] {
  const end = addDays(today, days);
  const open = tasks.filter((t) => isOpen(t) && t.dueDate && t.dueDate > today && t.dueDate <= end);
  const groups: Group<T>[] = [];
  for (let i = 1; i <= days; i++) {
    const date = addDays(today, i);
    groups.push({ key: date, label: date, tasks: open.filter((t) => t.dueDate === date).sort(compareTasks) });
  }
  const later = tasks.filter((t) => isOpen(t) && t.dueDate && t.dueDate > end).sort(compareTasks);
  if (later.length) groups.push({ key: "later", label: "Later", tasks: later });
  return groups;
}

export const inboxView = <T extends TaskLike>(tasks: T[]) =>
  tasks.filter((t) => isOpen(t) && !t.projectId && !t.parentId).sort((a, b) => a.sortOrder - b.sortOrder);

const STATUS_ORDER = ["in_progress", "todo", "backlog"] as const;
const STATUS_TITLE = { in_progress: "In progress", todo: "To do", backlog: "Backlog" };

export function projectView<T extends TaskLike>(tasks: T[], projectId: string): Group<T>[] {
  const mine = tasks.filter((t) => t.projectId === projectId && !t.parentId && isOpen(t));
  return STATUS_ORDER.map((s) => ({ key: s, label: STATUS_TITLE[s], tasks: mine.filter((t) => t.status === s).sort((a, b) => a.sortOrder - b.sortOrder) }));
}

export const labelView = <T extends TaskLike>(tasks: T[], label: string) => tasks.filter((t) => isOpen(t) && t.labels.includes(label)).sort(compareTasks);

/** Sidebar counts. */
export function counts(tasks: TaskLike[], today: string) {
  const open = tasks.filter(isOpen);
  const byProject: Record<string, number> = {};
  const byLabel: Record<string, number> = {};
  for (const t of open) {
    if (t.projectId && !t.parentId) byProject[t.projectId] = (byProject[t.projectId] ?? 0) + 1;
    for (const l of t.labels) byLabel[l] = (byLabel[l] ?? 0) + 1;
  }
  return {
    inbox: open.filter((t) => !t.projectId && !t.parentId).length,
    today: open.filter((t) => t.dueDate && t.dueDate <= today).length,
    overdue: open.filter((t) => t.dueDate && t.dueDate < today).length,
    upcoming: open.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= addDays(today, 14)).length,
    byProject,
    byLabel,
  };
}
