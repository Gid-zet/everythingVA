"use client";

import React from "react";
import { Bell, CalendarDays, Check, Flame, Inbox, Landmark, ListTodo, Mail, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Framed hero: a large white canvas inside the dark page (a calm, editorial
 * layout inspired by Awwwards-recognised product sites), with a tight
 * display headline, pill buttons and a product window that shows the
 * connected app: a Today view with a greeting, a week strip and the inbox.
 */
export function FramedHero({ actions }: { actions: React.ReactNode }) {
  return (
    <section className="px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="relative overflow-hidden rounded-[28px] bg-white text-neutral-950 sm:rounded-[36px]">
        {/* Soft colour wash at the top; the rest of the canvas stays flat. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
          style={{
            background:
              "radial-gradient(45% 60% at 20% 0%, rgba(99,102,241,0.10), transparent), radial-gradient(40% 55% at 85% 5%, rgba(14,165,233,0.10), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-[1120px] px-5 pb-10 pt-16 text-center sm:px-8 sm:pt-24">
          <a
            href="#modules"
            className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3.5 py-1.5 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-200"
          >
            <span className="rounded-full bg-neutral-950 px-2 py-px text-[11px] font-semibold text-white">New</span>
            Tasks, streaks and reminders, connected to your mail
          </a>
          <h1 className="mx-auto mt-7 max-w-[15ch] text-balance font-tight text-[clamp(2.75rem,7.5vw,5.75rem)] font-bold leading-[0.98] tracking-[-0.045em]">
            Mail, calendar and tasks in one calm place.
          </h1>
          <p className="mx-auto mt-6 max-w-[56ch] text-[17px] leading-[1.6] text-neutral-500 sm:text-[18px]">
            EverythingVA brings Gmail, Outlook and iCloud together with your calendar, your to-dos and the bids you&apos;re
            chasing, and an AI assistant that drafts, sorts and reminds without taking over.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">{actions}</div>
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-neutral-500">
            {["Gmail, Outlook and iCloud", "AI asks before it acts", "Free to start"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-emerald-600" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mx-auto max-w-[1120px] px-3 pb-3 sm:px-8 sm:pb-8">
          <ProductWindow />
        </div>
      </div>
    </section>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Illustrative product window (sample data), built in HTML so it stays crisp. */
function ProductWindow() {
  const [active, setActive] = React.useState(2);
  const [done, setDone] = React.useState<Set<number>>(new Set([0]));
  const tasks = [
    { t: "Reply to Dana about the workshop dates", tag: "Email", tone: "bg-sky-100 text-sky-700", time: "9:00 AM" },
    { t: "Prep: leadership session with Northwind", tag: "Meeting", tone: "bg-violet-100 text-violet-700", time: "1:30 PM" },
    { t: "Bid: Leadership Assessment Services", tag: "Procurement", tone: "bg-amber-100 text-amber-700", time: "Due Fri" },
    { t: "Send the signed proposal", tag: "Clients", tone: "bg-emerald-100 text-emerald-700", time: "4:00 PM" },
  ];
  const remaining = tasks.length - done.size;
  return (
    <div className="overflow-hidden rounded-[22px] border border-neutral-200 bg-neutral-50 text-left" role="img" aria-label="EverythingVA app preview with sample data">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2.5">
        <span className="size-3 rounded-full bg-[#ff5f57]" />
        <span className="size-3 rounded-full bg-[#febc2e]" />
        <span className="size-3 rounded-full bg-[#28c840]" />
        <div className="mx-auto flex w-full max-w-[340px] items-center gap-2 rounded-lg bg-neutral-100 px-3 py-1 text-[12px] text-neutral-400">
          <Search className="size-3.5" /> Search mail, tasks and events
        </div>
      </div>
      <div className="grid min-h-[380px] grid-cols-1 md:grid-cols-[180px_1fr_260px]">
        {/* Sidebar */}
        <aside className="hidden border-r border-neutral-200 bg-white p-3 md:block">
          {[
            [Inbox, "Inbox", "12"],
            [CalendarDays, "Today", "4", true],
            [CalendarDays, "Calendar", ""],
            [ListTodo, "Tasks", "9"],
            [Landmark, "Procurement", "3"],
          ].map(([Icon, label, n, on]) => {
            const I = Icon as React.ElementType;
            return (
              <div key={label as string} className={cn("mb-0.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px]", on ? "bg-neutral-100 font-semibold" : "text-neutral-500")}>
                <I className="size-4" />
                <span className="flex-1">{label as string}</span>
                {n && <span className="text-[11px] text-neutral-400">{n as string}</span>}
              </div>
            );
          })}
          <div className="mt-4 rounded-xl bg-neutral-100 p-3">
            <p className="flex items-center gap-1 text-[12px] font-semibold">
              <Flame className="size-3.5 text-orange-500" /> 6-day streak
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200">
              <div className="h-full w-3/5 rounded-full bg-neutral-900" />
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500">3 of 5 done today</p>
          </div>
        </aside>

        {/* Today */}
        <div className="p-5 sm:p-6">
          <p className="text-[12px] font-medium text-neutral-400">Wednesday</p>
          <p className="font-tight text-[26px] font-bold tracking-[-0.035em]">Today</p>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {DAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "flex flex-col items-center rounded-xl py-1.5 text-[11px] transition-colors",
                  i === active ? "bg-neutral-950 text-white" : "text-neutral-500 hover:bg-neutral-100",
                )}
              >
                {d}
                <span className="text-[14px] font-semibold">{17 + i}</span>
                <span className={cn("mt-0.5 size-1 rounded-full", [1, 2, 4].includes(i) ? (i === active ? "bg-white" : "bg-neutral-400") : "bg-transparent")} />
              </button>
            ))}
          </div>
          <p className="mt-4 rounded-2xl bg-white p-3 text-[13px] leading-relaxed text-neutral-600 ring-1 ring-neutral-200">
            Good morning. You have <span className="rounded-md bg-violet-100 px-1.5 py-0.5 font-medium text-violet-700">2 meetings</span>,{" "}
            <span className="rounded-md bg-sky-100 px-1.5 py-0.5 font-medium text-sky-700">{remaining} tasks</span> and{" "}
            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">1 bid closing</span> today.
          </p>
          <ul className="mt-3 space-y-1.5">
            {tasks.map((task, i) => {
              const isDone = done.has(i);
              return (
                <li key={task.t}>
                  <button
                    type="button"
                    onClick={() => setDone((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set(s).add(i)))}
                    className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left ring-1 ring-neutral-200 transition-colors hover:ring-neutral-300"
                  >
                    <span className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px]", isDone ? "border-neutral-900 bg-neutral-900" : "border-neutral-300")}>
                      {isDone && <Check className="size-3 text-white" strokeWidth={3} />}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate text-[13px]", isDone && "text-neutral-400 line-through")}>{task.t}</span>
                    <span className={cn("hidden rounded-md px-1.5 py-0.5 text-[10px] font-semibold sm:inline", task.tone)}>{task.tag}</span>
                    <span className="hidden w-16 text-right text-[11px] text-neutral-400 sm:inline">{task.time}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Inbox */}
        <aside className="hidden border-l border-neutral-200 bg-white p-4 md:block">
          <p className="flex items-center justify-between text-[13px] font-semibold">
            Inbox <span className="text-[11px] font-normal text-neutral-400">Sorted by AI</span>
          </p>
          {[
            ["Dana Ruiz", "Workshop dates for March", "Needs reply", "bg-rose-100 text-rose-700"],
            ["CanadaBuys", "New tender: facilitation services", "Opportunity", "bg-amber-100 text-amber-700"],
            ["Northwind", "Agenda for Wednesday", "Meeting", "bg-violet-100 text-violet-700"],
            ["Newsletter", "This week in leadership", "Read later", "bg-neutral-100 text-neutral-600"],
          ].map(([from, subject, label, tone]) => (
            <div key={subject} className="mt-2 rounded-xl px-2 py-2 hover:bg-neutral-50">
              <p className="flex items-center justify-between gap-2 text-[12px] font-semibold">
                <span className="truncate">{from}</span>
                <span className={cn("shrink-0 rounded px-1.5 py-px text-[10px] font-semibold", tone)}>{label}</span>
              </p>
              <p className="truncate text-[12px] text-neutral-500">{subject}</p>
            </div>
          ))}
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-neutral-950 p-3 text-[12px] text-white">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-violet-300" />
            <span>
              Draft ready for Dana. <span className="text-white/60">Review before sending.</span>
            </span>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-neutral-400">
            <Bell className="size-3" /> Reminder at 12:45 PM
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-400">
            <Mail className="size-3" /> 3 accounts connected
          </p>
        </aside>
      </div>
    </div>
  );
}
