"use client";
import React from "react";
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { DueChip, priorityMeta, ProjectDot, STATUSES, TaskCheck } from "./bits";
import type { Project, Task, TaskStore } from "./store";

const COLUMNS = STATUSES.filter((s) => s.id !== "canceled");

function Card({ task, project, today, onOpen, onToggle, dragging }: { task: Task; project?: Project; today: string; onOpen?: () => void; onToggle?: () => void; dragging?: boolean }) {
  const pm = priorityMeta(task.priority);
  return (
    <div
      onClick={onOpen}
      className={cn(
        "cursor-pointer select-none rounded-xl border bg-card p-3 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:border-foreground/20",
        dragging && "rotate-[1.5deg] shadow-lg ring-1 ring-foreground/10",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="pt-[1px]">
          <TaskCheck task={task} onToggle={onToggle ?? (() => undefined)} size="sm" />
        </div>
        <p className={cn("min-w-0 flex-1 leading-5", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-[26px] text-xs text-muted-foreground">
        <span className="font-mono text-[10px]">{task.number ? `T-${task.number}` : ""}</span>
        <DueChip task={task} today={today} />
        {task.priority !== "none" && (
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full" style={{ background: pm.color }} aria-hidden />
            {pm.label}
          </span>
        )}
        {project && (
          <span className="inline-flex items-center gap-1">
            <ProjectDot color={project.color} />
            {project.name}
          </span>
        )}
        {task.subtaskCount > 0 && (
          <span>
            {task.subtasksDone}/{task.subtaskCount}
          </span>
        )}
      </div>
    </div>
  );
}

function DraggableCard(props: { task: Task; project?: Project; today: string; onOpen: () => void; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.task.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-none outline-none", isDragging && "opacity-30")}>
      <Card {...props} />
    </div>
  );
}

function Column({ id, label, count, children }: { id: string; label: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-xs font-semibold">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </div>
      <div ref={setNodeRef} className={cn("flex min-h-24 flex-1 flex-col gap-2 rounded-2xl bg-muted/40 p-2 transition-colors", isOver && "bg-brand-soft ring-1 ring-brand/30")}>
        {children}
      </div>
    </div>
  );
}

/** Kanban by status (Linear/Plane). Drop a card on a column to change its status; it goes to the end. */
export function Board({
  tasks,
  store,
  today,
  projectsById,
  onOpen,
  onToggle,
  showProject = true,
}: {
  tasks: Task[];
  store: TaskStore;
  today: string;
  projectsById: Map<string, Project>;
  onOpen: (id: string) => void;
  onToggle: (t: Task) => void;
  showProject?: boolean;
}) {
  const projectOf = (t: Task) => (showProject && t.projectId ? projectsById.get(t.projectId) : undefined);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const [active, setActive] = React.useState<Task | null>(null);
  const byStatus = (s: string) => tasks.filter((t) => t.status === s && !t.parentId).sort((a, b) => a.sortOrder - b.sortOrder);

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const task = tasks.find((t) => t.id === e.active.id);
    const status = e.over?.id as Task["status"] | undefined;
    if (!task || !status || status === task.status) return;
    const column = byStatus(status);
    store.move({ id: task.id, status, beforeId: column.at(-1)?.id ?? null, afterId: null });
  };

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActive(tasks.find((t) => t.id === e.active.id) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
        {COLUMNS.map((c) => {
          const list = byStatus(c.id);
          return (
            <Column key={c.id} id={c.id} label={c.label} count={list.length}>
              {list.map((t) => (
                <DraggableCard key={t.id} task={t} project={projectOf(t)} today={today} onOpen={() => onOpen(t.id)} onToggle={() => onToggle(t)} />
              ))}
              {!list.length && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Drop tasks here</p>}
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>{active ? <Card task={active} project={projectOf(active)} today={today} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
