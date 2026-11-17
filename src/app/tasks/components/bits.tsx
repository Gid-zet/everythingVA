"use client";
import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays } from "@/lib/tasks/recurrence";
import type { Task } from "./store";

/** Project colours: the validated categorical palette (by name, so a label always accompanies them). */
export const PROJECT_COLORS: Record<string, string> = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
  yellow: "#eda100",
  magenta: "#e87ba4",
  green: "#008300",
  violet: "#6250d6",
  red: "#e34948",
  gray: "#8b8b93",
};

export const PRIORITIES = [
  { id: "urgent", label: "Urgent", short: "P1", color: "var(--viz-critical)" },
  { id: "high", label: "High", short: "P2", color: "var(--viz-serious)" },
  { id: "medium", label: "Medium", short: "P3", color: "var(--viz-1)" },
  { id: "low", label: "Low", short: "P4", color: "hsl(var(--muted-foreground))" },
  { id: "none", label: "No priority", short: "", color: "hsl(var(--muted-foreground) / 0.55)" },
] as const;
export const priorityMeta = (p: Task["priority"]) => PRIORITIES.find((x) => x.id === p)!;

export const STATUSES = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Done" },
  { id: "canceled", label: "Canceled" },
] as const;

/** Round checkbox whose ring shows priority (Todoist); filled when done. */
export function TaskCheck({ task, onToggle, size = "md" }: { task: Pick<Task, "status" | "priority" | "recurrence">; onToggle: () => void; size?: "sm" | "md" }) {
  const done = task.status === "done";
  const canceled = task.status === "canceled";
  const color = priorityMeta(task.priority).color;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? "Mark as not done" : task.recurrence ? "Complete this occurrence" : "Complete task"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "group/check flex shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
        size === "sm" ? "size-4" : "size-[18px]",
        canceled && "opacity-50",
      )}
      style={{ borderColor: color, background: done ? color : task.priority !== "none" ? `color-mix(in srgb, ${color} 10%, transparent)` : undefined }}
    >
      <Check
        className={cn("size-2.5 transition-opacity", done ? "text-white opacity-100" : "opacity-0 group-hover/check:opacity-60")}
        style={done ? undefined : { color }}
        strokeWidth={3}
      />
    </button>
  );
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h! >= 12 ? "PM" : "AM";
  const hh = h! % 12 || 12;
  return m ? `${hh}:${String(m).padStart(2, "0")} ${ampm}` : `${hh} ${ampm}`;
}

/** "Today", "Tomorrow", "Fri", "Nov 23", "Jan 3 2027". */
export function formatDue(date: string, today: string) {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  if (date === addDays(today, -1)) return "Yesterday";
  const d = new Date(`${date}T00:00:00Z`);
  if (date > today && date <= addDays(today, 6)) return WEEKDAY[d.getUTCDay()]!;
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return `${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}${sameYear ? "" : ` ${d.getUTCFullYear()}`}`;
}

export function formatDayHeading(date: string, today: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const rel = date === addDays(today, 1) ? "Tomorrow · " : "";
  return `${rel}${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()]}, ${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function DueChip({ task, today }: { task: Pick<Task, "dueDate" | "dueTime" | "status">; today: string }) {
  if (!task.dueDate) return null;
  const open = task.status !== "done" && task.status !== "canceled";
  const overdue = open && (task.dueDate < today);
  const isToday = task.dueDate === today;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        overdue ? "text-[var(--viz-critical)]" : isToday ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
      )}
    >
      {formatDue(task.dueDate, today)}
      {task.dueTime && ` ${formatTime(task.dueTime)}`}
    </span>
  );
}

export function ProjectDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: PROJECT_COLORS[color] ?? PROJECT_COLORS.gray }} aria-hidden />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground">{children}</kbd>;
}

export const formatEstimate = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
