"use client";
import React from "react";
import Link from "next/link";
import { ListTodo, Repeat } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { emitReward } from "@/components/task-rewards";
import { localDateTime } from "@/components/add-as-task";
import { TaskCheck, formatTime } from "@/app/tasks/components/bits";
import { QuickAdd } from "@/app/tasks/components/quick-add";
import { localToday } from "@/app/tasks/components/store";

/** Tasks due on the day selected in the calendar, with completion and quick add. */
export function DayTasks({ date }: { date: Date }) {
  const utils = api.useUtils();
  const day = localDateTime(date).date;
  const { data: tasks = [] } = api.tasks.dueOn.useQuery({ date: day }, { staleTime: 15_000 });
  const projects = api.tasks.list.useQuery(undefined, { staleTime: 60_000 }).data?.projects ?? [];
  const refresh = () => {
    void utils.tasks.dueOn.invalidate();
    void utils.tasks.list.invalidate();
  };
  const update = api.tasks.update.useMutation({
    onSuccess: ({ reward }) => {
      emitReward(reward);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const create = api.tasks.create.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const isToday = day === localToday();

  return (
    <section>
      <div className="flex items-center justify-between px-1">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
          <ListTodo className="size-3.5" />
          Tasks {isToday ? "today" : `on ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
        </p>
        <Link href={isToday ? "/tasks?view=today" : "/tasks?view=upcoming"} className="text-[11px] text-muted-foreground hover:text-foreground">
          Open
        </Link>
      </div>
      {tasks.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-start gap-2 rounded-md px-1 py-1 hover:bg-foreground/[0.03]">
              <div className="pt-0.5">
                <TaskCheck
                  task={t}
                  size="sm"
                  onToggle={() =>
                    update.mutate({ id: t.id, status: t.status === "done" ? "todo" : "done", today: localToday(), localHour: new Date().getHours() })
                  }
                />
              </div>
              <Link href={`/tasks?view=all&task=${t.id}`} className="min-w-0 flex-1">
                <span className={cn("block truncate text-[13px]", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</span>
                {(t.dueTime || t.recurrence) && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {t.dueTime && formatTime(t.dueTime)}
                    {t.recurrence && <Repeat className="size-3" />}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1.5">
        <QuickAdd
          compact
          projects={projects}
          defaults={{ dueDate: day }}
          onCreate={(input) => create.mutateAsync(input)}
          placeholder={tasks.length ? "Add another task" : "Add a task for this day"}
        />
      </div>
    </section>
  );
}
