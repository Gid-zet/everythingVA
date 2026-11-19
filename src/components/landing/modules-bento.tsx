import React from "react";
import { Bell, CalendarDays, Check, Flame, Inbox, Landmark, ListTodo, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Second white canvas: the four connected parts of the app as flat grey
 * cards (no shadows), each with a small, honest preview of what it does.
 */
export function ModulesBento() {
  return (
    <section id="modules" className="scroll-mt-20 px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="rounded-[28px] bg-white px-5 py-16 text-neutral-950 sm:rounded-[36px] sm:px-8 sm:py-24">
        <div className="mx-auto max-w-[1120px]">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-neutral-400">One app</p>
          <h2 className="mt-3 max-w-[18ch] text-balance font-tight text-[clamp(2.25rem,5vw,3.75rem)] font-bold leading-[1.02] tracking-[-0.045em]">
            Four tools that finally talk to each other.
          </h2>
          <p className="mt-5 max-w-[58ch] text-[17px] leading-[1.6] text-neutral-500">
            An email becomes a task. A meeting gets a prep reminder. A tender lands on your list with its deadline. Everything links back to
            where it came from.
          </p>

          <div className="mt-12 grid gap-3 md:grid-cols-6">
            <Card className="md:col-span-3" icon={Inbox} tone="from-sky-500 to-blue-600" title="Mail that sorts itself" text="Rules and AI file, label and archive for you, draft replies in your voice, and unsubscribe in one click.">
              <div className="space-y-1.5">
                {[
                  ["Needs reply", "bg-rose-100 text-rose-700", "Dana Ruiz · Workshop dates"],
                  ["Receipts", "bg-emerald-100 text-emerald-700", "Stripe · Your invoice"],
                  ["Newsletter", "bg-neutral-200 text-neutral-600", "Archived automatically"],
                ].map(([label, tone, text]) => (
                  <div key={text} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-[12px] ring-1 ring-neutral-200">
                    <span className={cn("rounded px-1.5 py-px text-[10px] font-semibold", tone)}>{label}</span>
                    <span className="truncate text-neutral-600">{text}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="md:col-span-3" icon={CalendarDays} tone="from-violet-500 to-fuchsia-600" title="A calendar beside your inbox" text="Day, week, month and agenda views across accounts. Turn any event into a task with one click.">
              <div className="grid grid-cols-5 gap-1.5">
                {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => (
                  <div key={d} className="rounded-xl bg-white p-1.5 ring-1 ring-neutral-200">
                    <p className="text-center text-[10px] text-neutral-400">{d}</p>
                    {i === 1 && <div className="mt-1 rounded-md bg-violet-100 px-1 py-1 text-[9px] font-semibold text-violet-700">Coaching</div>}
                    {i === 2 && <div className="mt-1 rounded-md bg-sky-100 px-1 py-1 text-[9px] font-semibold text-sky-700">Workshop</div>}
                    {i === 4 && <div className="mt-1 rounded-md bg-amber-100 px-1 py-1 text-[9px] font-semibold text-amber-700">Bid due</div>}
                    <div className="h-6" />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="md:col-span-2" icon={ListTodo} tone="from-emerald-500 to-teal-600" title="Tasks you'll actually finish" text="Type “call Dana friday 2pm p1” and it's scheduled. Repeats, subtasks, board view and reminders.">
              <div className="space-y-1.5">
                {["Call Dana", "Prep slides", "Send proposal"].map((t, i) => (
                  <div key={t} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-[12px] ring-1 ring-neutral-200">
                    <span className={cn("flex size-4 items-center justify-center rounded-full border-[1.5px]", i === 0 ? "border-neutral-900 bg-neutral-900" : "border-neutral-300")}>
                      {i === 0 && <Check className="size-2.5 text-white" strokeWidth={3} />}
                    </span>
                    <span className={cn(i === 0 && "text-neutral-400 line-through")}>{t}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="md:col-span-2" icon={Trophy} tone="from-orange-500 to-pink-600" title="Streaks, points and badges" text="Daily goals, levels and a streak with freezes for days off. Encouragement, never guilt.">
              <div className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-neutral-200">
                <span className="flex size-10 flex-col items-center justify-center rounded-full bg-orange-100 text-orange-600">
                  <Flame className="size-4" />
                  <span className="text-[10px] font-bold leading-none">6</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold">Level 3 · Achiever</p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200">
                    <div className="h-full w-[56%] rounded-full bg-neutral-900" />
                  </div>
                </div>
              </div>
            </Card>

            <Card className="md:col-span-2" icon={Landmark} tone="from-amber-400 to-orange-500" title="Bids found for you" text="Daily search of SAM.gov and CanadaBuys, with an AI fit score and a pipeline you control.">
              <div className="rounded-xl bg-white p-3 ring-1 ring-neutral-200">
                <p className="truncate text-[12px] font-semibold">Leadership Assessment Services</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200">
                    <div className="h-full w-[90%] rounded-full bg-emerald-500" />
                  </div>
                  <span className="text-[11px] font-bold tabular-nums">90</span>
                </div>
                <p className="mt-1.5 text-[11px] text-neutral-500">Closes in 2 days</p>
              </div>
            </Card>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              [Sparkles, "AI that asks first", "Drafts and suggestions wait for your OK. Nothing is sent or decided for you."],
              [Bell, "Reminders that reach you", "Push notifications before tasks are due, and a morning email digest."],
              [CalendarDays, "Linked both ways", "Every task links back to its email, event or opportunity."],
            ].map(([Icon, title, text]) => {
              const I = Icon as React.ElementType;
              return (
                <div key={title as string} className="rounded-[22px] bg-neutral-100 p-5">
                  <I className="size-5 text-neutral-900" />
                  <p className="mt-3 text-[15px] font-semibold tracking-[-0.01em]">{title as string}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-neutral-500">{text as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function Card({
  icon: Icon,
  tone,
  title,
  text,
  className,
  children,
}: {
  icon: React.ElementType;
  tone: string;
  title: string;
  text: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article className={cn("flex flex-col rounded-[22px] bg-neutral-100 p-5 sm:p-6", className)}>
      <span className={cn("flex size-9 items-center justify-center rounded-xl bg-gradient-to-br text-white", tone)}>
        <Icon className="size-4" />
      </span>
      <h3 className="mt-4 font-tight text-[20px] font-bold tracking-[-0.03em]">{title}</h3>
      <p className="mt-1.5 max-w-[46ch] text-[14px] leading-relaxed text-neutral-500">{text}</p>
      <div className="mt-5">{children}</div>
    </article>
  );
}
