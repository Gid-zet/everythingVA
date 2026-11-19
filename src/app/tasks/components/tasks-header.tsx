"use client";
import React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp, useNow } from "@/components/live";
import { addDays } from "@/lib/tasks/recurrence";
import { isOpen } from "@/lib/tasks/views";
import type { Task } from "./store";

/**
 * Page header for the task manager, matching the product window on the
 * homepage: a small grey label, a big tightly tracked title, a quiet live
 * indicator and neutral controls (no gradient banner).
 */
export function TasksHeader({
  label,
  title,
  subtitle,
  updatedAt,
  refreshing,
  actions,
  chips,
  children,
}: {
  label: string;
  title: string;
  subtitle?: string;
  updatedAt?: number;
  refreshing?: boolean;
  actions?: React.ReactNode;
  chips?: { label: string; value: number | string; tone: string }[];
  children?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <header className="mb-6">
      <div className="flex items-end justify-between gap-3">
        <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
            {label}
            {updatedAt ? <LiveDot updatedAt={updatedAt} refreshing={refreshing} /> : null}
          </p>
          <h1 className="truncate font-tight text-[34px] font-bold leading-tight tracking-[-0.04em] sm:text-[40px]">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </motion.div>
        {actions}
      </div>
      {chips && chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c.label} className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium", c.tone)}>
              <span className="font-semibold tabular-nums">{typeof c.value === "number" ? <CountUp value={c.value} /> : c.value}</span>
              {c.label}
            </span>
          ))}
        </div>
      )}
      {children}
    </header>
  );
}

function LiveDot({ updatedAt, refreshing }: { updatedAt: number; refreshing?: boolean }) {
  const now = useNow(1000);
  const secs = Math.max(0, Math.round((now - updatedAt) / 1000));
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-normal" title={refreshing ? "Syncing…" : `Synced ${secs < 5 ? "just now" : `${secs}s ago`}`}>
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70 motion-reduce:animate-none" />
        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
      </span>
      {refreshing ? "Syncing" : "Live"}
    </span>
  );
}

/** Neutral segmented control (List / Board). */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; icon: React.ElementType }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-muted p-0.5" role="group">
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          className={cn(
            "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            value === id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value === id && <motion.span layoutId="tasks-segment" className="absolute inset-0 rounded-lg bg-card shadow-sm ring-1 ring-border" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          <Icon className="relative size-3.5" />
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  );
}

/** Mon–Sun strip; the selected day is a black pill that slides between days. */
export function WeekStrip({ tasks, today, selected, base }: { tasks: Task[]; today: string; selected: string; base: string }) {
  const open = tasks.filter(isOpen);
  const dueOn = (d: string) => open.filter((t) => t.dueDate === d).length;
  const dow = new Date(`${selected}T00:00:00Z`).getUTCDay();
  const monday = addDays(selected, -((dow + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <div className="mt-4 flex items-center gap-1">
      <Link href={`${base}?view=day&date=${addDays(monday, -7)}`} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Previous week">
        <ChevronLeft className="size-4" />
      </Link>
      <div className="grid flex-1 grid-cols-7 gap-1">
        {week.map((d) => {
          const n = dueOn(d);
          const isSel = d === selected;
          const isToday = d === today;
          const wd = new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
          return (
            <Link
              key={d}
              href={isToday ? `${base}?view=today` : `${base}?view=day&date=${d}`}
              aria-current={isSel ? "date" : undefined}
              className={cn("relative flex flex-col items-center rounded-xl py-1.5 text-[11px] transition-colors", isSel ? "text-background" : "text-muted-foreground hover:bg-muted")}
            >
              {isSel && <motion.span layoutId="tasks-week-day" className="absolute inset-0 rounded-xl bg-foreground" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <span className={cn("relative", isToday && !isSel && "font-semibold text-foreground")}>{wd}</span>
              <span className="relative text-[15px] font-semibold tabular-nums">{Number(d.slice(8))}</span>
              <span className={cn("relative mt-0.5 size-1 rounded-full", n ? (isSel ? "bg-background" : "bg-muted-foreground/60") : "bg-transparent")} aria-label={n ? `${n} due` : undefined} />
            </Link>
          );
        })}
      </div>
      <Link href={`${base}?view=day&date=${addDays(monday, 7)}`} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Next week">
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}

/** "Good morning. You have 2 due today, 1 overdue and 3 done so far." with soft chips. */
export function Greeting({ tasks, today, doneToday }: { tasks: Task[]; today: string; doneToday: number | null }) {
  const open = tasks.filter(isOpen);
  const due = open.filter((t) => t.dueDate === today).length;
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).length;
  const fromMail = open.filter((t) => t.dueDate && t.dueDate <= today && t.threadId).length;
  const bids = open.filter((t) => t.dueDate && t.dueDate <= today && t.opportunityId).length;
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const chip = "inline-block rounded-md px-1.5 py-0.5 font-medium";
  const parts: React.ReactNode[] = [
    <span key="due" className={cn(chip, "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300")}>
      {due} {due === 1 ? "task" : "tasks"} due
    </span>,
  ];
  if (overdue) parts.push(<span key="over" className={cn(chip, "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300")}>{overdue} overdue</span>);
  if (fromMail) parts.push(<span key="mail" className={cn(chip, "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300")}>{fromMail} from email</span>);
  if (bids) parts.push(<span key="bid" className={cn(chip, "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300")}>{bids} {bids === 1 ? "bid" : "bids"}</span>);
  return (
    <p className="mt-4 rounded-2xl bg-card p-3.5 text-[14px] leading-relaxed text-muted-foreground ring-1 ring-border">
      {hello}. You have{" "}
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {p}
          {i < parts.length - 2 ? ", " : i === parts.length - 2 ? " and " : ""}
        </React.Fragment>
      ))}
      {doneToday !== null && (
        <>
          {" "}
          today, with <span className={cn(chip, "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300")}>{doneToday} done</span> so far
        </>
      )}
      .
    </p>
  );
}
