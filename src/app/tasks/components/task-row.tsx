"use client";
import React from "react";
import { AlignLeft, CalendarClock, Clock, GitBranch, Landmark, Mail, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays } from "@/lib/tasks/recurrence";
import { PROJECT_COLORS, TaskCheck, formatDue, formatEstimate, formatTime } from "./bits";
import type { Project, Task } from "./store";

/** Soft tinted pill for a project, from its colour. */
function ProjectPill({ project }: { project: Project }) {
  const hex = PROJECT_COLORS[project.color] ?? PROJECT_COLORS.gray!;
  return (
    <span
      className="hidden max-w-[9rem] shrink-0 truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold sm:inline"
      style={{ background: `color-mix(in srgb, ${hex} 14%, transparent)`, color: `color-mix(in srgb, ${hex} 80%, hsl(var(--foreground)))` }}
    >
      {project.name}
    </span>
  );
}

/** Source tag when a task came from somewhere (email, meeting, bid), like the homepage preview. */
function SourcePill({ task }: { task: Task }) {
  const s = task.opportunityId
    ? { label: "Procurement", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" }
    : task.eventId
      ? { label: "Meeting", cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" }
      : task.threadId
        ? { label: "Email", cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" }
        : null;
  if (!s) return null;
  return <span className={cn("hidden shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold sm:inline", s.cls)}>{s.label}</span>;
}

/** Right-hand time: the due time, or a short date when it isn't today. */
function When({ task, today }: { task: Task; today: string }) {
  if (!task.dueDate) return <span className="hidden w-[4.5rem] shrink-0 sm:inline" />;
  const open = task.status !== "done" && task.status !== "canceled";
  const overdue = open && task.dueDate < today;
  const text = task.dueDate === today ? (task.dueTime ? formatTime(task.dueTime) : "Today") : `${task.dueDate === addDays(today, 1) ? "Tomorrow" : formatDue(task.dueDate, today)}${task.dueTime ? ` ${formatTime(task.dueTime)}` : ""}`;
  return (
    <span className={cn("w-[4.5rem] shrink-0 text-right text-[12px] tabular-nums", overdue ? "font-medium text-[var(--viz-critical)]" : "text-muted-foreground")}>
      {text}
    </span>
  );
}

/** One task as a white rounded card (matches the product window on the homepage). */
export function TaskRow({
  task,
  project,
  today,
  selected,
  showProject = true,
  onOpen,
  onToggle,
}: {
  task: Task;
  project?: Project;
  today: string;
  selected?: boolean;
  showProject?: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const done = task.status === "done" || task.status === "canceled";
  const meta =
    task.recurrence || task.subtaskCount > 0 || task.description || task.estimateMinutes || task.labels.length || task.threadId || task.eventId || task.opportunityId;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
        if (e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      data-task-row
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-xl bg-card px-3 py-2.5 outline-none ring-1 ring-border transition-all hover:-translate-y-px hover:shadow-sm hover:ring-foreground/20 focus-visible:ring-2 focus-visible:ring-ring",
        selected && "ring-2 ring-foreground/40",
        task.id.startsWith("temp-") && "opacity-60",
      )}
    >
      <TaskCheck task={task} onToggle={onToggle} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[14px] leading-5", done && "text-muted-foreground line-through decoration-muted-foreground/50")}>{task.title}</p>
        {meta ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-muted-foreground">
            {task.recurrence && <Repeat className="size-3" aria-label="Repeats" />}
            {task.subtaskCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px]">
                <GitBranch className="size-3" />
                {task.subtasksDone}/{task.subtaskCount}
              </span>
            )}
            {task.description && <AlignLeft className="size-3" aria-label="Has notes" />}
            {task.threadId && <Mail className="size-3 sm:hidden" aria-label="From an email" />}
            {task.eventId && <CalendarClock className="size-3 sm:hidden" aria-label="From a calendar event" />}
            {task.opportunityId && <Landmark className="size-3 sm:hidden" aria-label="From procurement" />}
            {task.estimateMinutes && (
              <span className="inline-flex items-center gap-1 text-[11px]">
                <Clock className="size-3" />
                {formatEstimate(task.estimateMinutes)}
              </span>
            )}
            {task.labels.map((l) => (
              <span key={l} className="text-[11px] text-violet-700 dark:text-violet-300">
                @{l}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <SourcePill task={task} />
      {/* Skip the project pill when it would just repeat the source ("Procurement"). */}
      {showProject && project && !(task.opportunityId && project.name.toLowerCase() === "procurement") && <ProjectPill project={project} />}
      <When task={task} today={today} />
    </div>
  );
}
