"use client";
import React from "react";
import { CalendarDays, Clock, Flag, Hash, Plus, Repeat, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { dueInstant, parseQuickAdd, type Span } from "@/lib/tasks/quick-add";
import { describeRule, parseRule } from "@/lib/tasks/recurrence";
import { formatDue, formatEstimate, formatTime, Kbd, priorityMeta, ProjectDot } from "./bits";
import { localToday, type CreateInput, type Project } from "./store";

const SPAN_STYLE: Record<Span["kind"], string> = {
  date: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  repeat: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  priority: "bg-rose-500/15 text-rose-800 dark:text-rose-300",
  project: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  label: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  estimate: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
};

/**
 * One-line task entry with live highlighting of what will be parsed, like
 * Todoist. Defaults (project, date, status) come from the current view.
 */
export const QuickAdd = React.forwardRef<
  HTMLInputElement,
  {
    projects: Project[];
    defaults?: Partial<CreateInput>;
    onCreate: (input: CreateInput) => Promise<unknown>;
    placeholder?: string;
    autoFocus?: boolean;
    compact?: boolean;
    initialText?: string;
  }
>(function QuickAdd({ projects, defaults, onCreate, placeholder, autoFocus, compact, initialText }, ref) {
  const [text, setText] = React.useState(initialText ?? "");
  const [busy, setBusy] = React.useState(false);
  const overlay = React.useRef<HTMLDivElement>(null);
  const parsed = React.useMemo(() => (text.trim() ? parseQuickAdd(text) : null), [text]);
  const today = localToday();
  const project = parsed?.project ? projects.find((p) => p.name.toLowerCase() === parsed.project!.toLowerCase()) : undefined;

  const submit = async () => {
    if (!parsed?.title || busy) return;
    setBusy(true);
    const input = {
      ...defaults,
      title: parsed.title,
      priority: parsed.priority ?? defaults?.priority,
      labels: Array.from(new Set([...(defaults?.labels ?? []), ...parsed.labels])),
      ...(parsed.project ? (project ? { projectId: project.id } : { projectName: parsed.project, projectId: undefined }) : {}),
      ...(parsed.dueDate ? { dueDate: parsed.dueDate, dueTime: parsed.dueTime ?? null, dueAt: dueInstant(parsed.dueDate, parsed.dueTime) } : {}),
      ...(parsed.recurrence ? { recurrence: parsed.recurrence } : {}),
      ...(parsed.estimateMinutes ? { estimateMinutes: parsed.estimateMinutes } : {}),
    } as CreateInput;
    setText("");
    await onCreate(input);
    setBusy(false);
  };

  // Render the text with parsed tokens highlighted underneath a transparent input.
  const highlighted = React.useMemo(() => {
    if (!parsed) return text;
    const out: React.ReactNode[] = [];
    let pos = 0;
    parsed.spans.forEach((s, i) => {
      out.push(text.slice(pos, s.start));
      out.push(
        <mark key={i} className={cn("rounded-[3px] text-transparent", SPAN_STYLE[s.kind])}>
          {text.slice(s.start, s.end)}
        </mark>,
      );
      pos = s.end;
    });
    out.push(text.slice(pos));
    return out;
  }, [parsed, text]);

  const chips: { icon: React.ElementType; label: React.ReactNode }[] = [];
  if (parsed?.dueDate) chips.push({ icon: CalendarDays, label: `${formatDue(parsed.dueDate, today)}${parsed.dueTime ? ` ${formatTime(parsed.dueTime)}` : ""}` });
  if (parsed?.recurrence) chips.push({ icon: Repeat, label: describeRule(parseRule(parsed.recurrence)) });
  if (parsed?.priority) chips.push({ icon: Flag, label: priorityMeta(parsed.priority).label });
  if (parsed?.project)
    chips.push({
      icon: Hash,
      label: project ? (
        <span className="inline-flex items-center gap-1">
          <ProjectDot color={project.color} />
          {project.name}
        </span>
      ) : (
        `New project “${parsed.project}”`
      ),
    });
  for (const l of parsed?.labels ?? []) chips.push({ icon: Tag, label: l });
  if (parsed?.estimateMinutes) chips.push({ icon: Clock, label: formatEstimate(parsed.estimateMinutes) });

  return (
    <div className={cn("rounded-xl border bg-card shadow-sm transition-shadow focus-within:border-foreground/25 focus-within:shadow-md", compact && "shadow-none")}>
      <div className="flex items-center gap-2.5 px-3">
        <Plus className="size-4 shrink-0 text-muted-foreground" />
        <div className="relative min-w-0 flex-1">
          <div ref={overlay} aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden whitespace-pre text-sm text-transparent", compact ? "py-2" : "py-3")}>
            {highlighted}
          </div>
          <input
            ref={ref}
            value={text}
            autoFocus={autoFocus}
            onChange={(e) => setText(e.target.value)}
            onScroll={(e) => overlay.current && (overlay.current.scrollLeft = e.currentTarget.scrollLeft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              } else if (e.key === "Escape") {
                setText("");
                e.currentTarget.blur();
              }
            }}
            placeholder={placeholder ?? "Add a task: “Call Dana tomorrow 3pm p1 #Clients @phone”"}
            className={cn("relative w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground", compact ? "py-2" : "py-3")}
            aria-label="New task"
          />
        </div>
        {!compact && !text && (
          <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground sm:flex">
            <Kbd>Q</Kbd> to focus
          </span>
        )}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2">
          {chips.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[11px]">
              <c.icon className="size-3 text-muted-foreground" />
              {c.label}
            </span>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">
            <Kbd>Enter</Kbd> to add
          </span>
        </div>
      )}
    </div>
  );
});
