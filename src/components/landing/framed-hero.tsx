"use client";

import React from "react";
import { AnimatePresence, motion, useInView, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Bell, CalendarDays, Check, Flame, Inbox, Landmark, ListTodo, Mail, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Framed hero: a large white canvas inside the dark page, a tight display
 * headline that rises in word by word, drifting colour, and a product
 * window that tilts up as you scroll and then plays a short, looping
 * "day in the app" on its own (paused off-screen and with reduced motion).
 */
export function FramedHero({ actions }: { actions: React.ReactNode }) {
  const reduce = useReducedMotion();
  const words = "Mail, calendar and tasks in one calm place.".split(" ");
  return (
    <section className="px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="relative overflow-hidden rounded-[28px] bg-white text-neutral-950 sm:rounded-[36px]">
        {/* Drifting colour wash */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -left-40 -top-56 size-[620px] rounded-full bg-indigo-400/25 blur-[110px]"
          animate={reduce ? undefined : { x: [0, 120, 40, 0], y: [0, 60, 120, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 size-[560px] rounded-full bg-sky-300/30 blur-[110px]"
          animate={reduce ? undefined : { x: [0, -100, -30, 0], y: [0, 90, 20, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-1/3 top-40 size-[420px] rounded-full bg-fuchsia-300/20 blur-[110px]"
          animate={reduce ? undefined : { x: [0, 80, -60, 0], y: [0, -40, 30, 0] }}
          transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative mx-auto max-w-[1120px] px-5 pb-10 pt-16 text-center sm:px-8 sm:pt-24">
          <motion.a
            href="#modules"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full bg-neutral-100/80 px-3.5 py-1.5 text-[13px] font-medium text-neutral-700 backdrop-blur transition-colors hover:bg-neutral-200"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Tasks, streaks and reminders, connected to your mail
          </motion.a>
          <h1 className="mx-auto mt-7 max-w-[15ch] text-balance font-tight text-[clamp(2.75rem,7.5vw,5.75rem)] font-bold leading-[0.98] tracking-[-0.045em]">
            {words.map((w, i) => (
              <motion.span
                key={i}
                className="inline-block"
                initial={reduce ? false : { opacity: 0, y: "0.45em", filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.7, delay: 0.1 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
              >
                {w}
                {i < words.length - 1 ? " " : ""}
              </motion.span>
            ))}
          </h1>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.75 }}
            className="mx-auto mt-6 max-w-[56ch] text-[17px] leading-[1.6] text-neutral-500 sm:text-[18px]"
          >
            EverythingVA brings Gmail, Outlook and iCloud together with your calendar, your to-dos and the bids you&apos;re chasing, and an AI
            assistant that drafts, sorts and reminds without taking over.
          </motion.p>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.9 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3"
          >
            {actions}
          </motion.div>
          <motion.ul
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.05 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-neutral-500"
          >
            {["Gmail, Outlook and iCloud", "AI asks before it acts", "Free to start"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-emerald-600" />
                {t}
              </li>
            ))}
          </motion.ul>
        </div>
        <TiltIn>
          <ProductWindow />
        </TiltIn>
      </div>
    </section>
  );
}

/** The window tilts back and scales up into place as it scrolls into view. */
function TiltIn({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [18, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [60, 0]);
  return (
    <div ref={ref} className="relative mx-auto max-w-[1120px] px-3 pb-3 sm:px-8 sm:pb-8" style={{ perspective: 1400 }}>
      <motion.div style={reduce ? undefined : { rotateX, scale, y, transformOrigin: "center top" }}>{children}</motion.div>
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TASKS = [
  { t: "Reply to Dana about the workshop dates", tag: "Email", tone: "bg-sky-100 text-sky-700", time: "9:00 AM" },
  { t: "Prep: leadership session with Northwind", tag: "Meeting", tone: "bg-violet-100 text-violet-700", time: "1:30 PM" },
  { t: "Bid: Leadership Assessment Services", tag: "Procurement", tone: "bg-amber-100 text-amber-700", time: "Due Fri" },
  { t: "Send the signed proposal", tag: "Clients", tone: "bg-emerald-100 text-emerald-700", time: "4:00 PM" },
];
const BASE_INBOX = [
  { id: "dana", from: "Dana Ruiz", subject: "Workshop dates for March", label: "Needs reply", tone: "bg-rose-100 text-rose-700" },
  { id: "nw", from: "Northwind", subject: "Agenda for Wednesday", label: "Meeting", tone: "bg-violet-100 text-violet-700" },
  { id: "nl", from: "Newsletter", subject: "This week in leadership", label: "Read later", tone: "bg-neutral-100 text-neutral-600" },
];
const NEW_MAIL = { id: "cb", from: "CanadaBuys", subject: "New tender: facilitation services", label: "Opportunity", tone: "bg-amber-100 text-amber-700" };

type Demo = { done: number[]; mail: boolean; draft: "idle" | "typing" | "ready"; toast: boolean; streak: number };
const START: Demo = { done: [], mail: false, draft: "idle", toast: false, streak: 6 };
/** One beat every ~1.7 s; the last beat loops back to the start. */
const SCRIPT: ((d: Demo) => Demo)[] = [
  (d) => ({ ...d, done: [0] }),
  (d) => ({ ...d, mail: true }),
  (d) => ({ ...d, draft: "typing" }),
  (d) => ({ ...d, draft: "ready" }),
  (d) => ({ ...d, done: [...d.done, 1] }),
  (d) => ({ ...d, toast: true }),
  (d) => ({ ...d, done: [...d.done, 3] }),
  (d) => ({ ...d, toast: false, streak: 7 }),
  (d) => d,
  () => START,
];

/** Illustrative product window (sample data) that plays a short loop on its own. */
function ProductWindow() {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px" });
  const [demo, setDemo] = React.useState<Demo>(START);
  const [beat, setBeat] = React.useState(0);
  const [touched, setTouched] = React.useState(false);
  const [active, setActive] = React.useState(3);

  // Autoplay: only while visible, never after the visitor takes over, never with reduced motion.
  React.useEffect(() => {
    if (reduce || !inView || touched) return;
    const t = setTimeout(() => {
      setDemo((d) => SCRIPT[beat]!(d));
      setBeat((b) => (b + 1) % SCRIPT.length);
    }, 1700);
    return () => clearTimeout(t);
  }, [beat, inView, reduce, touched]);

  const toggle = (i: number) => {
    setTouched(true);
    setDemo((d) => ({ ...d, done: d.done.includes(i) ? d.done.filter((x) => x !== i) : [...d.done, i] }));
  };
  const order = [...TASKS.keys()].sort((a, b) => Number(demo.done.includes(a)) - Number(demo.done.includes(b)) || a - b);
  const remaining = TASKS.length - demo.done.length;
  const doneToday = 2 + demo.done.length;
  const inbox = demo.mail ? [NEW_MAIL, ...BASE_INBOX] : BASE_INBOX;

  return (
    <div ref={ref} className="relative overflow-hidden rounded-[22px] border border-neutral-200 bg-neutral-50 text-left shadow-[0_40px_80px_-30px_rgba(30,27,75,0.35)]" aria-label="EverythingVA app preview with sample data" role="img">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2.5">
        <span className="size-3 rounded-full bg-[#ff5f57]" />
        <span className="size-3 rounded-full bg-[#febc2e]" />
        <span className="size-3 rounded-full bg-[#28c840]" />
        <div className="mx-auto flex w-full max-w-[340px] items-center gap-2 rounded-lg bg-neutral-100 px-3 py-1 text-[12px] text-neutral-400">
          <Search className="size-3.5" /> Search mail, tasks and events
        </div>
      </div>
      <div className="grid min-h-[400px] grid-cols-1 md:grid-cols-[180px_1fr_260px]">
        {/* Sidebar */}
        <aside className="hidden border-r border-neutral-200 bg-white p-3 md:block">
          {(
            [
              [Inbox, "Inbox", String(11 + (demo.mail ? 1 : 0))],
              [CalendarDays, "Today", String(remaining), true],
              [CalendarDays, "Calendar", ""],
              [ListTodo, "Tasks", "9"],
              [Landmark, "Procurement", String(3 + (demo.mail ? 1 : 0))],
            ] as const
          ).map(([Icon, label, n, on]) => (
            <div key={label} className={cn("mb-0.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px]", on ? "bg-neutral-100 font-semibold" : "text-neutral-500")}>
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
              {n && (
                <motion.span key={n} initial={reduce ? false : { scale: 1.6, color: "#4f46e5" }} animate={{ scale: 1, color: "#a3a3a3" }} className="text-[11px]">
                  {n}
                </motion.span>
              )}
            </div>
          ))}
          <div className="mt-4 rounded-xl bg-neutral-100 p-3">
            <p className="flex items-center gap-1 text-[12px] font-semibold">
              <motion.span
                animate={reduce ? undefined : { scale: [1, 1.25, 1], rotate: [0, -8, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                className="inline-flex"
              >
                <Flame className="size-3.5 text-orange-500" />
              </motion.span>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={demo.streak} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }}>
                  {demo.streak}-day streak
                </motion.span>
              </AnimatePresence>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200">
              <motion.div className="h-full rounded-full bg-neutral-900" animate={{ width: `${Math.min(100, (doneToday / 5) * 100)}%` }} transition={{ type: "spring", stiffness: 120, damping: 18 }} />
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500">{Math.min(doneToday, 5)} of 5 done today</p>
          </div>
        </aside>

        {/* Today */}
        <div className="p-5 sm:p-6">
          <p className="text-[12px] font-medium text-neutral-400">Thursday</p>
          <p className="font-tight text-[26px] font-bold tracking-[-0.035em]">Today</p>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {DAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setTouched(true);
                  setActive(i);
                }}
                className={cn("relative flex flex-col items-center rounded-xl py-1.5 text-[11px] transition-colors", i === active ? "text-white" : "text-neutral-500 hover:bg-neutral-100")}
              >
                {i === active && <motion.span layoutId="hero-day" className="absolute inset-0 rounded-xl bg-neutral-950" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <span className="relative">{d}</span>
                <span className="relative text-[14px] font-semibold">{16 + i}</span>
                <span className={cn("relative mt-0.5 size-1 rounded-full", [1, 3, 4].includes(i) ? (i === active ? "bg-white" : "bg-neutral-400") : "bg-transparent")} />
              </button>
            ))}
          </div>
          <p className="mt-4 rounded-2xl bg-white p-3 text-[13px] leading-relaxed text-neutral-600 ring-1 ring-neutral-200">
            Good morning. You have <span className="rounded-md bg-violet-100 px-1.5 py-0.5 font-medium text-violet-700">2 meetings</span>,{" "}
            <motion.span key={remaining} initial={reduce ? false : { scale: 1.15 }} animate={{ scale: 1 }} className="inline-block rounded-md bg-sky-100 px-1.5 py-0.5 font-medium text-sky-700">
              {remaining} {remaining === 1 ? "task" : "tasks"}
            </motion.span>{" "}
            and <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">1 bid closing</span> today.
          </p>
          <ul className="mt-3 space-y-1.5">
            {order.map((i) => {
              const task = TASKS[i]!;
              const isDone = demo.done.includes(i);
              return (
                <motion.li key={task.t} layout="position" transition={{ type: "spring", stiffness: 260, damping: 28 }}>
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left ring-1 ring-neutral-200 transition-colors hover:ring-neutral-300"
                  >
                    <motion.span
                      animate={{ backgroundColor: isDone ? "#0a0a0a" : "#ffffff", borderColor: isDone ? "#0a0a0a" : "#d4d4d4", scale: isDone ? [1, 1.25, 1] : 1 }}
                      transition={{ duration: 0.35 }}
                      className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px]"
                    >
                      {isDone && (
                        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                          <Check className="size-3 text-white" strokeWidth={3} />
                        </motion.span>
                      )}
                    </motion.span>
                    <span className={cn("min-w-0 flex-1 truncate text-[13px] transition-colors", isDone && "text-neutral-400 line-through")}>{task.t}</span>
                    <span className={cn("hidden rounded-md px-1.5 py-0.5 text-[10px] font-semibold sm:inline", task.tone)}>{task.tag}</span>
                    <span className="hidden w-16 text-right text-[11px] text-neutral-400 sm:inline">{task.time}</span>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        </div>

        {/* Inbox */}
        <aside className="hidden border-l border-neutral-200 bg-white p-4 md:block">
          <p className="flex items-center justify-between text-[13px] font-semibold">
            Inbox <span className="text-[11px] font-normal text-neutral-400">Sorted by AI</span>
          </p>
          <ul>
            <AnimatePresence initial={false}>
              {inbox.map((m) => (
                <motion.li
                  key={m.id}
                  layout
                  initial={{ opacity: 0, x: 24, backgroundColor: "rgba(251,191,36,0.18)" }}
                  animate={{ opacity: 1, x: 0, backgroundColor: "rgba(255,255,255,0)" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.5, backgroundColor: { duration: 2.4 } }}
                  className="mt-2 rounded-xl px-2 py-2"
                >
                  <p className="flex items-center justify-between gap-2 text-[12px] font-semibold">
                    <span className="truncate">{m.from}</span>
                    <span className={cn("shrink-0 rounded px-1.5 py-px text-[10px] font-semibold", m.tone)}>{m.label}</span>
                  </p>
                  <p className="truncate text-[12px] text-neutral-500">{m.subject}</p>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <div className="mt-3 flex min-h-[52px] items-start gap-2 rounded-xl bg-neutral-950 p-3 text-[12px] text-white">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-violet-300" />
            <AnimatePresence mode="wait" initial={false}>
              {demo.draft === "typing" ? (
                <motion.span key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-white/70">
                  Drafting a reply
                  {[0, 1, 2].map((i) => (
                    <motion.span key={i} className="size-1 rounded-full bg-white/70" animate={{ y: [0, -3, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12 }} />
                  ))}
                </motion.span>
              ) : demo.draft === "ready" ? (
                <motion.span key="ready" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  Draft ready for Dana. <span className="text-white/60">Review before sending.</span>
                </motion.span>
              ) : (
                <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-white/60">
                  Ask anything about your mail…
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-neutral-400">
            <Bell className="size-3" /> Reminder at 1:15 PM
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-400">
            <Mail className="size-3" /> 3 accounts connected
          </p>
        </aside>
      </div>

      {/* Push-notification style toast */}
      <AnimatePresence>
        {demo.toast && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className="absolute right-4 top-14 z-10 flex w-[260px] items-start gap-2.5 rounded-2xl bg-white/95 p-3 shadow-xl ring-1 ring-neutral-200 backdrop-blur"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white">
              <Bell className="size-4" />
            </span>
            <span className="min-w-0 text-[12px]">
              <span className="block font-semibold">Prep: leadership session</span>
              <span className="block text-neutral-500">Due in 15 min · 1:30 PM</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
