"use client";

import React from "react";
import { CalendarPlus, Check, Undo2, Video } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const START = 9; // 9am
const HOURS = 8; // to 5pm
const ROW = 34; // px per hour

type Ev = { day: number; start: number; len: number; title: string; color: "work" | "personal"; video?: boolean };

const EVENTS: Ev[] = [
  { day: 0, start: 9.5, len: 1, title: "Standup", color: "work", video: true },
  { day: 0, start: 14, len: 1.5, title: "Contract review", color: "work" },
  { day: 1, start: 10, len: 1, title: "Design crit", color: "work", video: true },
  { day: 1, start: 16, len: 1, title: "Gym", color: "personal" },
  { day: 2, start: 9.5, len: 1, title: "Standup", color: "work", video: true },
  { day: 3, start: 11, len: 2, title: "Offsite planning", color: "work" },
  { day: 4, start: 13, len: 1, title: "Dentist", color: "personal" },
];

const COLORS = {
  work: "border-l-[hsl(var(--brand))] bg-[hsl(var(--brand)/0.12)] text-foreground",
  personal: "border-l-emerald-500 bg-emerald-500/10 text-foreground",
  new: "border-l-amber-500 bg-amber-500/15 text-foreground",
};

/** Email → event: one click and the lunch lands on Wednesday at noon. */
export function CalendarDemo() {
  const [added, setAdded] = React.useState(false);
  const lunch: Ev = { day: 2, start: 12, len: 1, title: "Lunch with Tom", color: "personal" };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)] lg:items-start">
      {/* Email */}
      <div className="rounded-2xl border bg-background p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <span className="sender-avatar flex size-9 items-center justify-center rounded-full text-[12px] font-semibold" style={{ ["--h" as string]: 32 }}>
            TA
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold">Tom Alvarez</p>
            <p className="text-[12px] text-muted-foreground">Lunch next week?</p>
          </div>
        </div>
        <p className="mt-4 text-[14px] leading-relaxed text-foreground/85">
          It&apos;s been ages! Are you free <mark className="rounded bg-amber-500/20 px-0.5 text-inherit">Wednesday around noon</mark>? There&apos;s a new ramen place near the office.
        </p>
        <div className="mt-5 flex items-center gap-2">
          {!added ? (
            <button
              type="button"
              onClick={() => setAdded(true)}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-medium text-background transition-transform hover:-translate-y-px active:scale-95"
            >
              <CalendarPlus className="size-4" /> Add to calendar
            </button>
          ) : (
            <>
              <span className="inline-flex h-9 items-center gap-2 rounded-full bg-emerald-500/10 px-4 text-[13px] font-medium text-emerald-700 dark:text-emerald-300">
                <Check className="size-4" /> Added for Wed, 12:00
              </span>
              <button type="button" onClick={() => setAdded(false)} className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-[12px] text-muted-foreground hover:text-foreground">
                <Undo2 className="size-3.5" /> Undo
              </button>
            </>
          )}
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">Guests, time and place come from the email. Tom gets the invite.</p>
      </div>

      {/* Week */}
      <div className="overflow-hidden rounded-2xl border bg-background">
        <div className="grid grid-cols-[40px_repeat(5,minmax(0,1fr))] border-b text-center text-[11px] font-medium text-muted-foreground">
          <span />
          {DAYS.map((d, i) => (
            <span key={d} className={cn("py-2", i === 2 && "text-foreground")}>
              {d}
            </span>
          ))}
        </div>
        <div className="relative grid grid-cols-[40px_repeat(5,minmax(0,1fr))]" style={{ height: HOURS * ROW }}>
          <div className="relative">
            {Array.from({ length: HOURS }, (_, h) => (
              <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted-foreground/70" style={{ top: h * ROW }}>
                {h === 0 ? "" : `${((START + h - 1) % 12) + 1}${START + h < 12 ? "a" : "p"}`}
              </span>
            ))}
          </div>
          {DAYS.map((d, day) => (
            <div key={d} className="relative border-l border-foreground/[0.06]">
              {Array.from({ length: HOURS }, (_, h) => (
                <div key={h} className="border-b border-foreground/[0.05]" style={{ height: ROW }} />
              ))}
              {[...EVENTS, ...(added ? [lunch] : [])]
                .filter((e) => e.day === day)
                .map((e) => {
                  const isNew = added && e === lunch;
                  return (
                    <div
                      key={e.title + e.start}
                      className={cn(
                        "absolute inset-x-1 overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-[11px] font-medium leading-tight",
                        isNew ? COLORS.new : COLORS[e.color],
                        isNew && "animate-in fade-in slide-in-from-top-3 zoom-in-95 duration-500",
                      )}
                      style={{ top: (e.start - START) * ROW + 1, height: e.len * ROW - 3 }}
                    >
                      <span className="flex items-center gap-1 truncate">
                        {e.video && <Video className="size-3 shrink-0 opacity-60" />}
                        {e.title}
                      </span>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[hsl(var(--brand))]" /> Work · Google
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" /> Personal · Outlook
          </span>
        </div>
      </div>
    </div>
  );
}
