"use client";
import React from "react";
import Link from "next/link";
import { CalendarDays, Clock, Flag, Folder, History, Mail, Repeat, Trash2, X, CircleDot, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ChipsInput } from "@/app/procurement/components/bits";
import { dueInstant } from "@/lib/tasks/quick-add";
import { describeRule, parseRule } from "@/lib/tasks/recurrence";
import { cn } from "@/lib/utils";
import { PRIORITIES, STATUSES, TaskCheck, formatDue } from "./bits";
import { QuickAdd } from "./quick-add";
import { localToday, type Task, type TaskStore } from "./store";

const REPEATS = [
  { label: "Doesn't repeat", value: "" },
  { label: "Every day", value: "FREQ=DAILY;INTERVAL=1" },
  { label: "Every weekday", value: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR" },
  { label: "Every week", value: "FREQ=WEEKLY;INTERVAL=1" },
  { label: "Every 2 weeks", value: "FREQ=WEEKLY;INTERVAL=2" },
  { label: "Every month", value: "FREQ=MONTHLY;INTERVAL=1" },
  { label: "Every year", value: "FREQ=YEARLY;INTERVAL=1" },
];

const field = "h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Row({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-3">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Side panel for one task: every field, subtasks, the email it came from, history. */
export function TaskDetail({ task, store, onClose, onOpen }: { task: Task | null; store: TaskStore; onClose: () => void; onOpen: (id: string) => void }) {
  const today = localToday();
  const activity = store.useActivity(task?.id ?? null);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  React.useEffect(() => {
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
  }, [task?.id, task?.title, task?.description]);

  if (!task) return <Sheet open={false} onOpenChange={() => undefined} />;
  const subtasks = store.tasks.filter((t) => t.parentId === task.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const parent = task.parentId ? store.tasks.find((t) => t.id === task.parentId) : undefined;
  const update = (fields: Omit<Parameters<TaskStore["update"]>[0], "id">) => store.update({ id: task.id, ...fields });
  const toggle = (t: Task) => store.update({ id: t.id, status: t.status === "done" ? "todo" : "done" });
  const repeatKnown = REPEATS.some((r) => r.value === (task.recurrence ?? ""));

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl [&>button]:hidden">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-5 py-3 backdrop-blur">
          <span className="font-mono text-xs text-muted-foreground">{task.number ? `T-${task.number}` : "New"}</span>
          {parent && (
            <button className="truncate text-xs text-muted-foreground hover:text-foreground" onClick={() => onOpen(parent.id)}>
              › {parent.title}
            </button>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label="Delete task"
              onClick={() => {
                if (confirm(`Delete “${task.title}”${subtasks.length ? ` and its ${subtasks.length} subtasks` : ""}?`)) {
                  store.remove(task.id);
                  onClose();
                }
              }}
            >
              <Trash2 className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="size-8" aria-label="Close" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5">
          <div className="flex items-start gap-3">
            <div className="pt-1.5">
              <TaskCheck task={task} onToggle={() => toggle(task)} />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="sr-only">{task.title}</SheetTitle>
              <textarea
                value={title}
                rows={1}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title.trim() && title.trim() !== task.title && update({ title: title.trim() })}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
                className="w-full resize-none bg-transparent text-lg font-semibold leading-snug outline-none [field-sizing:content]"
                aria-label="Title"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => description !== (task.description ?? "") && update({ description: description || null })}
                placeholder="Add notes…"
                rows={3}
                className="mt-1 w-full resize-y bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60 focus:text-foreground"
                aria-label="Notes"
              />
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl border p-4">
            <Row icon={CircleDot} label="Status">
              <select className={field} value={task.status} onChange={(e) => update({ status: e.target.value as Task["status"] })}>
                {STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row icon={Flag} label="Priority">
              <select className={field} value={task.priority} onChange={(e) => update({ priority: e.target.value as Task["priority"] })}>
                {PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                    {p.short ? ` (${p.short})` : ""}
                  </option>
                ))}
              </select>
            </Row>
            <Row icon={Folder} label="Project">
              <select className={field} value={task.projectId ?? ""} onChange={(e) => update({ projectId: e.target.value || null })}>
                <option value="">Inbox</option>
                {store.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row icon={CalendarDays} label="Due">
              <div className="flex gap-2">
                <input
                  type="date"
                  className={field}
                  value={task.dueDate ?? ""}
                  onChange={(e) => {
                    const d = e.target.value || null;
                    update({ dueDate: d, dueTime: d ? task.dueTime : null, dueAt: d ? dueInstant(d, task.dueTime) : null });
                  }}
                />
                <input
                  type="time"
                  className={cn(field, "w-32")}
                  value={task.dueTime ?? ""}
                  disabled={!task.dueDate}
                  onChange={(e) => update({ dueDate: task.dueDate, dueTime: e.target.value || null, dueAt: dueInstant(task.dueDate, e.target.value || null) })}
                  aria-label="Due time"
                />
              </div>
              {task.dueDate && <p className="mt-1 text-[11px] text-muted-foreground">{formatDue(task.dueDate, today)}</p>}
            </Row>
            <Row icon={Repeat} label="Repeat">
              <select
                className={field}
                value={task.recurrence ?? ""}
                onChange={(e) => update({ recurrence: e.target.value || null, ...(e.target.value && !task.dueDate ? { dueDate: today } : {}) })}
              >
                {!repeatKnown && <option value={task.recurrence ?? ""}>{describeRule(parseRule(task.recurrence))}</option>}
                {REPEATS.map((r) => (
                  <option key={r.label} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row icon={Clock} label="Estimate">
              <select className={field} value={task.estimateMinutes ?? ""} onChange={(e) => update({ estimateMinutes: e.target.value ? Number(e.target.value) : null })}>
                <option value="">None</option>
                {[15, 30, 45, 60, 90, 120, 180, 240, 480].map((m) => (
                  <option key={m} value={m}>
                    {m >= 60 ? `${m / 60}h` : `${m}m`}
                  </option>
                ))}
                {task.estimateMinutes && ![15, 30, 45, 60, 90, 120, 180, 240, 480].includes(task.estimateMinutes) && <option value={task.estimateMinutes}>{task.estimateMinutes}m</option>}
              </select>
            </Row>
            <Row icon={Tag} label="Labels">
              <ChipsInput value={task.labels} onChange={(labels) => update({ labels: labels.map((l) => l.toLowerCase().replace(/^@/, "")) })} placeholder="Add a label" />
            </Row>
          </div>

          {task.thread && (
            <Link
              href={`/mail?thread=${task.thread.id}&account=${task.thread.accountId}`}
              className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors hover:bg-muted/50"
            >
              <Mail className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-[11px] text-muted-foreground">From email</span>
                <span className="block truncate">{task.thread.subject || "(no subject)"}</span>
              </span>
            </Link>
          )}

          {!task.parentId && (
            <div>
              <p className="mb-2 text-xs font-semibold">
                Subtasks{" "}
                {subtasks.length > 0 && (
                  <span className="font-normal text-muted-foreground">
                    {subtasks.filter((s) => s.status === "done").length}/{subtasks.length}
                  </span>
                )}
              </p>
              {subtasks.length > 0 && (
                <ul className="mb-2 space-y-0.5">
                  {subtasks.map((s) => (
                    <li key={s.id} className="flex items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-muted/50">
                      <TaskCheck task={s} onToggle={() => toggle(s)} size="sm" />
                      <button className={cn("min-w-0 flex-1 truncate text-left text-sm", s.status === "done" && "text-muted-foreground line-through")} onClick={() => onOpen(s.id)}>
                        {s.title}
                      </button>
                      {s.dueDate && <span className="text-[11px] text-muted-foreground">{formatDue(s.dueDate, today)}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <QuickAdd compact projects={store.projects} defaults={{ parentId: task.id, projectId: task.projectId }} onCreate={store.create} placeholder="Add a subtask" />
            </div>
          )}

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
              <History className="size-3.5" /> Activity
            </p>
            {activity.length ? (
              <ol className="space-y-1.5">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-2 text-xs">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    <span className="min-w-0">
                      {a.summary} <span className="text-muted-foreground">· {new Date(a.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground">No activity yet.</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
