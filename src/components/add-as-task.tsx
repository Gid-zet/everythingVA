"use client";
import React from "react";
import Link from "next/link";
import { CheckCircle2, ListPlus, ListTodo, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, type RouterInputs } from "@/trpc/react";

type CreateInput = RouterInputs["tasks"]["create"];

/**
 * "Add as task" for something elsewhere in the app (a calendar event, a
 * procurement opportunity). If it's already in your tasks, links to it instead.
 */
export function AddAsTaskButton({
  existing,
  build,
  label = "Add as task",
  size = "sm",
  variant = "outline",
  onAdded,
}: {
  existing: { id: string; status: string }[] | undefined;
  build: () => CreateInput;
  label?: string;
  size?: "sm" | "default";
  variant?: "outline" | "ghost" | "default";
  onAdded?: () => void;
}) {
  const utils = api.useUtils();
  const create = api.tasks.create.useMutation({
    onSuccess: (t) => {
      void utils.tasks.invalidate();
      onAdded?.();
      toast.success("Added to your tasks", {
        action: { label: "Open", onClick: () => (window.location.href = `/tasks?view=all&task=${t.id}`) },
      });
    },
    onError: (e) => toast.error(e.message),
  });

  if (existing?.length) {
    const open = existing.filter((t) => t.status !== "done" && t.status !== "canceled");
    const first = open[0] ?? existing[0]!;
    return (
      <Button variant="ghost" size={size} asChild>
        <Link href={`/tasks?view=all&task=${first.id}`}>
          {open.length ? <ListTodo className="mr-1.5 size-4" /> : <CheckCircle2 className="mr-1.5 size-4 text-emerald-600" />}
          {open.length ? (existing.length > 1 ? `In tasks (${existing.length})` : "In your tasks") : "Task done"}
        </Link>
      </Button>
    );
  }
  return (
    <Button variant={variant} size={size} onClick={() => create.mutate(build())} disabled={create.isPending}>
      {create.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <ListPlus className="mr-1.5 size-4" />}
      {label}
    </Button>
  );
}

/** Local calendar date and time for an instant. */
export function localDateTime(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
