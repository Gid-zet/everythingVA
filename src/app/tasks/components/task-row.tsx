"use client";
import React from "react";
import { AlignLeft, Clock, GitBranch, Mail, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { DueChip, formatEstimate, ProjectDot, TaskCheck } from "./bits";
import type { Project, Task } from "./store";

/** One line in a list: check, title, then metadata (Todoist density, Linear restraint). */
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
        "group flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/70",
        selected && "bg-muted/70",
        task.id.startsWith("temp-") && "opacity-60",
      )}
    >
      <div className="pt-[1px]">
        <TaskCheck task={task} onToggle={onToggle} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-5", done && "text-muted-foreground line-through decoration-muted-foreground/50")}>{task.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 empty:hidden">
          <DueChip task={task} today={today} />
          {task.recurrence && <Repeat className="size-3 text-muted-foreground" aria-label="Repeats" />}
          {task.subtaskCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <GitBranch className="size-3" />
              {task.subtasksDone}/{task.subtaskCount}
            </span>
          )}
          {task.description && <AlignLeft className="size-3 text-muted-foreground" aria-label="Has notes" />}
          {task.threadId && <Mail className="size-3 text-muted-foreground" aria-label="From an email" />}
          {task.estimateMinutes && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" />
              {formatEstimate(task.estimateMinutes)}
            </span>
          )}
          {task.labels.map((l) => (
            <span key={l} className="text-xs text-violet-700 dark:text-violet-300">
              @{l}
            </span>
          ))}
        </div>
      </div>
      {showProject && project && (
        <span className="hidden shrink-0 items-center gap-1.5 pt-0.5 text-xs text-muted-foreground sm:inline-flex">
          {project.name}
          <ProjectDot color={project.color} />
        </span>
      )}
      <span className="hidden shrink-0 pt-0.5 font-mono text-[10px] text-muted-foreground/70 group-hover:inline">{task.number ? `T-${task.number}` : ""}</span>
    </div>
  );
}
