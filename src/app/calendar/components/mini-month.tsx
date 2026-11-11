"use client";

import React from "react";
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Compact month grid for the calendar sidebar; dots mark days with events. */
export function MiniMonth({
  selected,
  onSelect,
  eventDays,
}: {
  selected: Date;
  onSelect: (d: Date) => void;
  eventDays?: Set<string>;
}) {
  const [month, setMonth] = React.useState(() => startOfMonth(selected));
  React.useEffect(() => setMonth(startOfMonth(selected)), [selected]);

  const first = startOfWeek(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));

  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-semibold">{format(month, "MMMM yyyy")}</p>
        <div className="flex">
          <button type="button" onClick={() => setMonth((m) => subMonths(m, 1))} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Next month">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-medium text-muted-foreground">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7" role="grid" aria-label={format(month, "MMMM yyyy")}>
        {days.map((d) => {
          const sel = isSameDay(d, selected);
          const has = eventDays?.has(format(d, "yyyy-MM-dd"));
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onSelect(d)}
              aria-pressed={sel}
              aria-label={format(d, "EEEE, MMMM d")}
              className={cn(
                "relative mx-auto flex size-8 items-center justify-center rounded-full text-[12px] tabular-nums transition-colors",
                !isSameMonth(d, month) && "text-muted-foreground/50",
                isToday(d) && !sel && "font-semibold text-brand",
                sel ? "bg-foreground font-semibold text-background" : "hover:bg-muted",
              )}
            >
              {format(d, "d")}
              {has && !sel && <span className="absolute bottom-1 size-1 rounded-full bg-brand/70" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
