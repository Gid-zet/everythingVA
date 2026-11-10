"use client";

import React from "react";
import { addDays, format, nextMonday, nextSaturday, set } from "date-fns";
import { AlarmClock, CalendarClock, Moon, Sun, Sunrise } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const at = (d: Date, hours: number) =>
  set(d, { hours, minutes: 0, seconds: 0, milliseconds: 0 });

function presets(now = new Date()) {
  const laterToday = set(now, { minutes: 0, seconds: 0, milliseconds: 0 });
  laterToday.setHours(laterToday.getHours() + 3);
  const list = [
    { label: "Later today", icon: Sun, date: laterToday, show: laterToday.getDate() === now.getDate() },
    { label: "Tomorrow", icon: Sunrise, date: at(addDays(now, 1), 8), show: true },
    { label: "This weekend", icon: Moon, date: at(nextSaturday(now), 8), show: now.getDay() < 5 && now.getDay() !== 0 },
    { label: "Next week", icon: CalendarClock, date: at(nextMonday(now), 8), show: true },
  ];
  return list.filter((p) => p.show);
}

export function SnoozeMenu({
  onSnooze,
  disabled,
  children,
  align = "start",
}: {
  onSnooze: (until: Date) => void;
  disabled?: boolean;
  children: React.ReactNode;
  align?: "start" | "end" | "center";
}) {
  const [open, setOpen] = React.useState(false);
  const [custom, setCustom] = React.useState("");
  const options = React.useMemo(() => (open ? presets() : []), [open]);

  const pick = (date: Date) => {
    setOpen(false);
    setCustom("");
    onSnooze(date);
  };

  const customDate = custom ? new Date(custom) : null;
  const customValid = !!customDate && customDate.getTime() > Date.now();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-1.5">
        <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Snooze until
        </p>
        {options.map((o) => (
          <button
            key={o.label}
            onClick={() => pick(o.date)}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.05]"
          >
            <o.icon className="size-4 text-muted-foreground" />
            <span className="font-medium">{o.label}</span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {format(o.date, o.label === "Later today" ? "h:mm a" : "EEE h a")}
            </span>
          </button>
        ))}
        <div className="mt-1 border-t px-1 pb-0.5 pt-2">
          <label className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
            <AlarmClock className="size-3.5" />
            Pick date & time
          </label>
          <div className="mt-1.5 flex gap-1.5">
            <input
              type="datetime-local"
              value={custom}
              min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
              onChange={(e) => setCustom(e.target.value)}
              className={cn(
                "h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            />
            <Button
              size="sm"
              className="h-8 bg-brand px-2.5 text-xs text-brand-foreground hover:bg-brand/90"
              disabled={!customValid}
              onClick={() => customDate && pick(customDate)}
            >
              Snooze
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
