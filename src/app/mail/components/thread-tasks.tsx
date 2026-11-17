"use client";
import React from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/trpc/react";
import { QuickAdd } from "@/app/tasks/components/quick-add";
import { formatDue, priorityMeta } from "@/app/tasks/components/bits";
import { localToday, type CreateInput } from "@/app/tasks/components/store";

/** "Add task" from an email: quick add prefilled with the subject, plus AI-suggested action items. */
export function ThreadTaskDialog({ threadId, subject, open, onOpenChange }: { threadId: string; subject: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const utils = api.useUtils();
  const projects = api.tasks.list.useQuery(undefined, { enabled: open, staleTime: 60_000 }).data?.projects ?? [];
  const create = api.tasks.create.useMutation({
    onSuccess: () => {
      void utils.tasks.forThread.invalidate({ threadId });
      void utils.tasks.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const suggest = api.tasks.suggestFromThread.useMutation({ onError: (e) => toast.error(e.message) });
  const [added, setAdded] = React.useState<Set<number>>(new Set());
  React.useEffect(() => {
    if (!open) {
      suggest.reset();
      setAdded(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const add = async (input: CreateInput) => {
    await create.mutateAsync({ ...input, threadId });
    toast.success("Task added");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a task from this email</DialogTitle>
        </DialogHeader>
        <QuickAdd key={String(open)} autoFocus compact projects={projects} initialText={subject ? `Follow up: ${subject} ` : ""} onCreate={add} />
        <p className="-mt-1 text-[11px] text-muted-foreground">Type a date, p1–p4, #project or @label. The task links back to this email.</p>

        <div className="mt-2 border-t pt-4">
          {!suggest.data ? (
            <Button variant="outline" size="sm" onClick={() => suggest.mutate({ threadId, today: localToday() })} disabled={suggest.isPending}>
              {suggest.isPending ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Sparkles className="mr-2 size-3.5" />}
              {suggest.isPending ? "Reading the thread…" : "Suggest tasks with AI"}
            </Button>
          ) : suggest.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No action items for you in this thread.</p>
          ) : (
            <ul className="space-y-2">
              {suggest.data.map((s, i) => (
                <li key={i} className="flex items-start gap-3 rounded-lg border p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">“{s.reason}”</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {[s.dueDate ? `Due ${formatDue(s.dueDate, localToday())}` : null, s.priority !== "none" ? priorityMeta(s.priority).label : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={added.has(i) ? "ghost" : "outline"}
                    disabled={added.has(i) || create.isPending}
                    onClick={async () => {
                      await add({ title: s.title, dueDate: s.dueDate, priority: s.priority });
                      setAdded((a) => new Set(a).add(i));
                    }}
                  >
                    {added.has(i) ? <CheckCircle2 className="size-3.5" /> : <Plus className="size-3.5" />}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">Suggestions come from the email text. Check them before adding.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
