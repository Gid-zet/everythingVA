"use client";

import React from "react";
import { Archive, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInView } from "./hooks";

type Row = { id: number; from: string; subject: string; starred: boolean; archived: boolean };

const SEED: Row[] = [
  { id: 1, from: "Daniel Okafor", subject: "Re: Contract redlines", starred: false, archived: false },
  { id: 2, from: "Stripe", subject: "Your receipt #2041-7781", starred: false, archived: false },
  { id: 3, from: "Priya Natarajan", subject: "Design crit, Thursday 2pm", starred: false, archived: false },
  { id: 4, from: "Product Hunt", subject: "Today's top 10 launches", starred: false, archived: false },
  { id: 5, from: "Tom Alvarez", subject: "Lunch next week?", starred: false, archived: false },
];

const KEYS: { key: string; label: string; hint: string; wide?: boolean }[] = [
  { key: "j", label: "J", hint: "Next" },
  { key: "k", label: "K", hint: "Previous" },
  { key: "e", label: "E", hint: "Archive" },
  { key: "s", label: "S", hint: "Star" },
  { key: "u", label: "U", hint: "Undo" },
];

/**
 * A live slice of the app: while this section is on screen, J/K/E/S/U drive
 * the mini inbox and the matching keycap lights up. Keycaps are also buttons,
 * so it works on touch screens.
 */
export function KeyboardDemo() {
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  const [rows, setRows] = React.useState(SEED);
  const [cursor, setCursor] = React.useState(0);
  const [pressed, setPressed] = React.useState<string | null>(null);
  const [log, setLog] = React.useState("Press J to start");
  const history = React.useRef<Row[][]>([]);

  const visible = rows.filter((r) => !r.archived);
  const current = visible[Math.min(cursor, visible.length - 1)];

  const act = React.useCallback(
    (key: string) => {
      setPressed(key);
      setTimeout(() => setPressed((p) => (p === key ? null : p)), 160);
      const list = rows.filter((r) => !r.archived);
      const sel = list[Math.min(cursor, list.length - 1)];
      switch (key) {
        case "j":
          setCursor((c) => Math.min(c + 1, Math.max(list.length - 1, 0)));
          setLog("Next conversation");
          break;
        case "k":
          setCursor((c) => Math.max(c - 1, 0));
          setLog("Previous conversation");
          break;
        case "e":
          if (!sel) return;
          history.current.push(rows);
          setRows((rs) => rs.map((r) => (r.id === sel.id ? { ...r, archived: true } : r)));
          setCursor((c) => Math.min(c, Math.max(list.length - 2, 0)));
          setLog(`Archived “${sel.subject}”`);
          break;
        case "s":
          if (!sel) return;
          history.current.push(rows);
          setRows((rs) => rs.map((r) => (r.id === sel.id ? { ...r, starred: !r.starred } : r)));
          setLog(sel.starred ? "Star removed" : `Starred “${sel.subject}”`);
          break;
        case "u": {
          const prev = history.current.pop();
          if (prev) {
            setRows(prev);
            setLog("Undone");
          } else {
            setRows(SEED);
            setCursor(0);
            setLog("Inbox restored");
          }
          break;
        }
      }
    },
    [rows, cursor],
  );

  React.useEffect(() => {
    if (!inView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
      const k = e.key.toLowerCase();
      if (KEYS.some((x) => x.key === k)) {
        e.preventDefault();
        act(k);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inView, act]);

  const inboxZero = visible.length === 0;

  return (
    <div ref={ref} className="w-full">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-[12px] text-white/50">
          <span>Inbox · {visible.length}</span>
          <span aria-live="polite" className="truncate pl-4 text-white/70">
            {log}
          </span>
        </div>
        <ul className="relative min-h-[236px]">
          {inboxZero ? (
            <li className="flex h-[236px] flex-col items-center justify-center gap-1 text-center">
              <span className="font-display text-3xl font-semibold text-white">Inbox zero</span>
              <span className="text-[13px] text-white/50">Press U to bring everything back.</span>
            </li>
          ) : (
            visible.map((r, i) => {
              const sel = current?.id === r.id;
              return (
                <li
                  key={r.id}
                  className={cn(
                    "relative flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 text-[13px] transition-colors duration-150",
                    sel ? "bg-[hsl(var(--brand)/0.22)]" : "",
                  )}
                  onClick={() => setCursor(i)}
                >
                  {sel && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[hsl(var(--brand))]" />}
                  <span className="w-28 shrink-0 truncate font-medium text-white">{r.from}</span>
                  <span className="min-w-0 flex-1 truncate text-white/60">{r.subject}</span>
                  {r.starred && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Starred" />}
                </li>
              );
            })
          )}
        </ul>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2.5 sm:gap-3" role="group" aria-label="Try the shortcuts">
        {KEYS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => act(k.key)}
            className="group flex flex-col items-center gap-1.5 focus-visible:outline-none"
            aria-label={`${k.label}: ${k.hint}`}
          >
            <kbd
              className={cn(
                "inline-flex size-14 items-center justify-center rounded-xl border font-sans text-xl font-semibold text-white transition-all duration-100 sm:size-16 sm:text-2xl",
                "border-white/15 bg-gradient-to-b from-white/[0.14] to-white/[0.04] shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_-3px_0_rgba(0,0,0,0.35)_inset,0_6px_14px_-6px_rgba(0,0,0,0.6)]",
                "group-focus-visible:ring-2 group-focus-visible:ring-white/60",
                pressed === k.key &&
                  "translate-y-[2px] border-[hsl(var(--brand)/0.8)] from-[hsl(var(--brand))] to-[hsl(var(--brand)/0.7)] shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_-1px_0_rgba(0,0,0,0.35)_inset,0_0_24px_hsl(var(--brand)/0.6)]",
              )}
            >
              {k.label}
            </kbd>
            <span className="text-[11px] text-white/50">{k.hint}</span>
          </button>
        ))}
      </div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[12px] text-white/40">
        <Archive className="size-3" /> Try it: these keys work right now.
      </p>
    </div>
  );
}
