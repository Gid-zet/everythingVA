"use client";

import React from "react";
import { Archive, Check, CornerDownLeft, Sparkles, Star, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInView, useTypewriter } from "./hooks";

/* ───────────────────────── Ask your inbox ───────────────────────── */

const QA = [
  {
    q: "When does my flight to Lisbon leave?",
    a: "Friday at 7:40am, TAP 1352. It's in your booking confirmation from October 28.",
  },
  {
    q: "What did Daniel want changed in the contract?",
    a: "Section 4.2: a 30-day termination notice instead of 60. He asked for a call tomorrow.",
  },
  {
    q: "How much did I spend on software last month?",
    a: "$312 across 6 receipts. The largest was Figma at $144 on October 3.",
  },
];

export function AskDemo() {
  const [i, setI] = React.useState(0);
  const [ref, inView] = useInView<HTMLDivElement>(0.5);
  const [seen, setSeen] = React.useState(false);
  React.useEffect(() => {
    if (inView) setSeen(true);
  }, [inView]);
  // The first answer types once the card scrolls into view; later ones on click.
  const { shown, done } = useTypewriter(QA[i]!.a, seen, 16);

  return (
    <div ref={ref}>
      <div className="min-h-[124px] space-y-3" aria-live="polite">
        <div key={`q${i}`} className="ml-auto w-fit max-w-[85%] animate-in fade-in slide-in-from-bottom-1 rounded-2xl rounded-br-md bg-foreground/[0.07] px-4 py-2.5 text-[14px] duration-300">
          {QA[i]!.q}
        </div>
        <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-brand px-4 py-2.5 text-[14px] text-brand-foreground">
          {shown}
          {!done && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-current" />}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {QA.map((x, j) => (
          <button
            key={x.q}
            type="button"
            onClick={() => setI(j)}
            aria-pressed={i === j}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] transition-colors",
              i === j ? "border-brand/40 bg-brand-soft text-brand" : "bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {x.q}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── Bulk unsubscribe ───────────────────────── */

const SENDERS = [
  { name: "Product Hunt Daily", n: 186, off: true },
  { name: "Medium Digest", n: 142, off: true },
  { name: "LinkedIn", n: 97, off: false },
  { name: "Notion Team", n: 41, off: true },
  { name: "Figma", n: 23, off: false },
];

export function UnsubscribeDemo() {
  const [state, setState] = React.useState(() => SENDERS.map((s) => s.off));
  const saved = SENDERS.reduce((sum, s, i) => sum + (state[i] ? s.n : 0), 0);
  return (
    <div>
      <ul className="mt-7 divide-y divide-foreground/[0.07] rounded-2xl border border-foreground/[0.08]">
        {SENDERS.map((s, i) => (
          <li key={s.name} className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="tabular-nums text-muted-foreground">{s.n}</span>
            <button
              type="button"
              onClick={() => setState((st) => st.map((v, j) => (j === i ? !v : v)))}
              aria-pressed={state[i]}
              aria-label={`${state[i] ? "Keep" : "Unsubscribe from"} ${s.name}`}
              className={cn(
                "w-[96px] rounded-full py-1 text-center text-[11px] font-medium transition-all duration-200 active:scale-95",
                state[i] ? "bg-foreground text-background" : "border border-foreground/15 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {state[i] ? "Unsubscribed" : "Unsubscribe"}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-[13px] text-muted-foreground">
        <span className="font-semibold tabular-nums text-foreground transition-all">{saved}</span> emails a month you&apos;ll no longer get.
      </p>
    </div>
  );
}

/* ───────────────────────── Replies in your voice ───────────────────────── */

const TYPED = "Thanks Daniel, section 4.2 works for us if";
const GHOST = " we move the notice period to 30 days. Free tomorrow at 10?";

export function DraftDemo() {
  const [accepted, setAccepted] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      tabIndex={0}
      role="textbox"
      aria-label="Example reply. Press Tab to accept the suggestion."
      onKeyDown={(e) => {
        if (e.key === "Tab" && !accepted) {
          e.preventDefault();
          setAccepted(true);
        }
        if (e.key === "Backspace" || e.key === "Escape") setAccepted(false);
      }}
      onClick={() => setAccepted((a) => !a)}
      className="mt-6 cursor-text rounded-2xl border border-foreground/[0.08] p-4 text-[14px] leading-relaxed outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
    >
      {TYPED}
      <span className={cn("transition-colors duration-300", accepted ? "text-foreground" : "text-muted-foreground/55")}>{GHOST}</span>
      {accepted && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-foreground" />}
      <span className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {accepted ? (
          <>
            <Check className="size-3 text-emerald-600" /> Accepted. Click to try again.
          </>
        ) : (
          <>
            <kbd className="rounded border bg-muted px-1.5 font-sans">Tab</kbd> or click to accept
          </>
        )}
      </span>
    </div>
  );
}

/* ───────────────────────── Organizer rules ───────────────────────── */

type Mail = { from: string; subject: string; kind: "invoice" | "promo" | "person" | "news" };
const MAIL: Mail[] = [
  { from: "Stripe", subject: "Invoice #2041 paid", kind: "invoice" },
  { from: "Shop Co", subject: "48 hours only: 30% off", kind: "promo" },
  { from: "Daniel Okafor", subject: "Can we talk tomorrow?", kind: "person" },
  { from: "The Verge", subject: "This week in tech", kind: "news" },
];

const RULES = [
  { prompt: "Label invoices as Finance and star them", match: "invoice", label: "Finance", star: true, archive: false },
  { prompt: "Archive promotions", match: "promo", label: "Marketing", star: false, archive: true },
  { prompt: "Flag anything that needs my reply", match: "person", label: "To Reply", star: false, archive: false },
] as const;

export function OrganizerDemo() {
  const [active, setActive] = React.useState<number[]>([]);
  const applied = (m: Mail) => RULES.filter((r, i) => active.includes(i) && r.match === m.kind);

  return (
    <div>
      <div className="mt-6 flex flex-wrap gap-2">
        {RULES.map((r, i) => {
          const on = active.includes(i);
          return (
            <button
              key={r.prompt}
              type="button"
              aria-pressed={on}
              onClick={() => setActive((a) => (on ? a.filter((x) => x !== i) : [...a, i]))}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-all duration-200 active:scale-95",
                on ? "border-brand bg-brand text-brand-foreground" : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {on ? <Check className="size-3" /> : <Sparkles className="size-3" />}
              {r.prompt}
            </button>
          );
        })}
      </div>
      <ul className="mt-4 space-y-1.5">
        {MAIL.map((m) => {
          const rules = applied(m);
          const archived = rules.some((r) => r.archive);
          return (
            <li
              key={m.subject}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-foreground/[0.07] bg-background px-3 py-2 text-[13px] transition-all duration-500",
                archived && "translate-x-3 opacity-40",
              )}
            >
              <span className="w-24 shrink-0 truncate font-medium">{m.from}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{m.subject}</span>
              <span className="flex shrink-0 items-center gap-1">
                {rules.map((r) => (
                  <span key={r.label} className="inline-flex animate-in zoom-in-75 items-center gap-1 rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand duration-200">
                    <Tag className="size-3" />
                    {r.label}
                  </span>
                ))}
                {rules.some((r) => r.star) && <Star className="size-3.5 animate-in zoom-in-50 fill-amber-400 text-amber-500 duration-200" aria-label="Starred" />}
                {archived && <Archive className="size-3.5 text-muted-foreground" aria-label="Archived" />}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <CornerDownLeft className="size-3" /> Tap a rule to see it work. In the app you just describe it.
      </p>
    </div>
  );
}
