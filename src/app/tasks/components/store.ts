"use client";
import React from "react";
import { toast } from "sonner";
import { api, type RouterInputs, type RouterOutputs } from "@/trpc/react";

export type Task = RouterOutputs["tasks"]["list"]["tasks"][number];
export type Project = RouterOutputs["tasks"]["list"]["projects"][number];
export type CreateInput = RouterInputs["tasks"]["create"];
export type UpdateInput = RouterInputs["tasks"]["update"];
export type MoveInput = RouterInputs["tasks"]["move"];
export type Activity = { id: string; action: string; summary: string; createdAt: Date };

/**
 * Everything the task screens need, behind one interface: the live tRPC store
 * below, or an in-memory one for previews. Writes update the cache first
 * (optimistic, like Linear/Todoist), then sync; failures roll back.
 */
export type TaskStore = {
  tasks: Task[];
  projects: Project[];
  loading: boolean;
  create: (input: CreateInput) => Promise<Task | undefined>;
  update: (input: UpdateInput) => void;
  move: (input: MoveInput) => void;
  remove: (id: string) => void;
  saveProject: (input: RouterInputs["tasks"]["saveProject"]) => Promise<void>;
  deleteProject: (id: string) => void;
  useActivity: (taskId: string | null) => Activity[];
};

export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function useTrpcTaskStore(): TaskStore {
  const utils = api.useUtils();
  const list = api.tasks.list.useQuery(undefined, { staleTime: 15_000, refetchOnWindowFocus: true });
  const onError = (e: { message: string }) => {
    toast.error(e.message);
    void utils.tasks.list.invalidate();
  };
  const patch = (fn: (tasks: Task[]) => Task[]) =>
    utils.tasks.list.setData(undefined, (old) => (old ? { ...old, tasks: fn(old.tasks) } : old));

  const createM = api.tasks.create.useMutation({ onError });
  const updateM = api.tasks.update.useMutation({
    onSuccess: (t) => {
      patch((all) => all.map((x) => (x.id === t.id ? { ...x, ...t } : x)));
      // Projects may have been created from "#name"; repeating tasks move dates.
      void utils.tasks.list.invalidate();
    },
    onError,
  });
  const moveM = api.tasks.move.useMutation({ onError });
  const removeM = api.tasks.delete.useMutation({ onError, onSuccess: () => void utils.tasks.list.invalidate() });
  const saveProjectM = api.tasks.saveProject.useMutation({ onError, onSuccess: () => void utils.tasks.list.invalidate() });
  const deleteProjectM = api.tasks.deleteProject.useMutation({ onError, onSuccess: () => void utils.tasks.list.invalidate() });

  return {
    tasks: list.data?.tasks ?? [],
    projects: list.data?.projects ?? [],
    loading: list.isLoading,
    create: async (input) => {
      const temp = `temp-${Math.random().toString(36).slice(2)}`;
      const project = list.data?.projects.find((p) => p.id === input.projectId);
      patch((all) => [
        ...all,
        {
          id: temp,
          number: 0,
          title: input.title,
          description: input.description ?? null,
          status: input.status ?? "todo",
          priority: input.priority ?? "none",
          projectId: project?.id ?? null,
          labels: input.labels ?? [],
          parentId: input.parentId ?? null,
          dueDate: input.dueDate ?? null,
          dueTime: input.dueTime ?? null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          estimateMinutes: input.estimateMinutes ?? null,
          recurrence: input.recurrence ?? null,
          sortOrder: Number.MAX_SAFE_INTEGER,
          completedAt: null,
          threadId: input.threadId ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          thread: null,
          _count: { subtasks: 0 },
          subtaskCount: 0,
          subtasksDone: 0,
        } as Task,
      ]);
      try {
        const t = await createM.mutateAsync(input);
        patch((all) => all.map((x) => (x.id === temp ? ({ ...t, subtaskCount: 0, subtasksDone: 0 } as Task) : x)));
        void utils.tasks.list.invalidate();
        return t as Task;
      } catch {
        patch((all) => all.filter((x) => x.id !== temp));
        return undefined;
      }
    },
    update: (input) => {
      const { id, today: _t, projectName: _p, ...fields } = input;
      patch((all) =>
        all.map((x) =>
          x.id === id
            ? ({
                ...x,
                ...fields,
                completedAt: fields.status ? (fields.status === "done" || fields.status === "canceled" ? new Date() : null) : x.completedAt,
              } as Task)
            : x,
        ),
      );
      updateM.mutate({ ...input, today: input.today ?? localToday() });
    },
    move: (input) => {
      patch((all) => {
        const before = all.find((x) => x.id === input.beforeId);
        const after = all.find((x) => x.id === input.afterId);
        const sortOrder = before && after ? (before.sortOrder + after.sortOrder) / 2 : before ? before.sortOrder + 10000 : after ? after.sortOrder - 10000 : undefined;
        return all.map((x) => (x.id === input.id ? { ...x, ...(sortOrder !== undefined ? { sortOrder } : {}), ...(input.status ? { status: input.status } : {}) } : x));
      });
      moveM.mutate(input);
    },
    remove: (id) => {
      patch((all) => all.filter((x) => x.id !== id && x.parentId !== id));
      removeM.mutate({ id });
    },
    saveProject: async (input) => {
      await saveProjectM.mutateAsync(input);
    },
    deleteProject: (id) => deleteProjectM.mutate({ id }),
    useActivity: function useActivity(taskId) {
      const q = api.tasks.get.useQuery({ id: taskId ?? "" }, { enabled: !!taskId && !taskId.startsWith("temp-") });
      return React.useMemo(() => (q.data?.activity ?? []) as Activity[], [q.data]);
    },
  };
}
