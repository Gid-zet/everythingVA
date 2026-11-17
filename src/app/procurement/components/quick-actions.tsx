"use client";
import React from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, FileUp, ListPlus, Loader2, Radar, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type QuickActionsState = {
  canRun: boolean;
  find: { run: () => void; running: boolean };
  assess: { run: () => void; running: boolean; done: number; total: number; available: number; aiConfigured: boolean };
  addTop: { run: () => void; running: boolean; title: string | null; inTasks: boolean; taskId: string | null };
  clarifications: number;
  unverified: number;
  missingDocs: number;
};

type Tone = "blue" | "violet" | "emerald" | "amber" | "rose" | "sky";
const TONES: Record<Tone, { chip: string; ring: string; bg: string }> = {
  blue: { chip: "bg-gradient-to-br from-sky-500 to-blue-600", ring: "hover:ring-blue-500/40", bg: "from-blue-500/[0.07]" },
  violet: { chip: "bg-gradient-to-br from-violet-500 to-fuchsia-600", ring: "hover:ring-violet-500/40", bg: "from-violet-500/[0.07]" },
  emerald: { chip: "bg-gradient-to-br from-emerald-500 to-teal-600", ring: "hover:ring-emerald-500/40", bg: "from-emerald-500/[0.07]" },
  amber: { chip: "bg-gradient-to-br from-amber-400 to-orange-500", ring: "hover:ring-amber-500/40", bg: "from-amber-500/[0.08]" },
  rose: { chip: "bg-gradient-to-br from-rose-500 to-pink-600", ring: "hover:ring-rose-500/40", bg: "from-rose-500/[0.07]" },
  sky: { chip: "bg-gradient-to-br from-cyan-500 to-sky-600", ring: "hover:ring-sky-500/40", bg: "from-cyan-500/[0.07]" },
};

function ActionCard({
  tone,
  icon: Icon,
  title,
  detail,
  onClick,
  href,
  disabled,
  running,
  progress,
}: {
  tone: Tone;
  icon: React.ElementType;
  title: string;
  detail: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  running?: boolean;
  progress?: number;
}) {
  const t = TONES[tone];
  const body = (
    <>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm", t.chip)}>
        {running ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1 text-[13px] font-semibold leading-tight">
          {title}
          {href && <ArrowUpRight className="size-3.5 text-muted-foreground" />}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{detail}</span>
        {progress !== undefined && (
          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-[var(--viz-track)]">
            <span className="block h-full rounded-full bg-[var(--viz-1)] transition-[width] duration-500" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
      </span>
    </>
  );
  const cls = cn(
    "group flex min-w-0 items-start gap-3 rounded-2xl border bg-gradient-to-br to-transparent p-3.5 text-left ring-1 ring-transparent transition-all",
    t.bg,
    disabled ? "cursor-not-allowed opacity-55" : cn("hover:-translate-y-0.5 hover:shadow-md", t.ring),
  );
  if (href && !disabled)
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled || running}>
      {body}
    </button>
  );
}

/** One-click actions that do real work (or jump straight to the work). */
export function QuickActions({ s }: { s: QuickActionsState }) {
  return (
    <section aria-label="Quick actions">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-violet-500" />
        <h2 className="text-[13px] font-semibold tracking-tight">Quick actions</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ActionCard
          tone="blue"
          icon={Radar}
          title={s.find.running ? "Searching sources…" : "Find opportunities"}
          detail="Search SAM.gov and CanadaBuys now"
          onClick={s.find.run}
          running={s.find.running}
          disabled={!s.canRun}
        />
        <ActionCard
          tone="violet"
          icon={Sparkles}
          title={
            s.assess.running
              ? `Assessing ${s.assess.done}/${s.assess.total}…`
              : s.assess.available
                ? `Assess ${Math.min(5, s.assess.available)} with AI`
                : "Assess with AI"
          }
          detail={
            !s.assess.aiConfigured
              ? "AI isn't configured"
              : s.assess.available
                ? "Qualification agent scores the most relevant unassessed opportunities"
                : "Everything active has been assessed"
          }
          onClick={s.assess.run}
          running={s.assess.running}
          progress={s.assess.running ? s.assess.done / Math.max(1, s.assess.total) : undefined}
          disabled={!s.canRun || !s.assess.aiConfigured || !s.assess.available}
        />
        {s.addTop.inTasks && s.addTop.taskId ? (
          <ActionCard tone="emerald" icon={CheckCircle2} title="Best match is in your tasks" detail={s.addTop.title ?? ""} href={`/tasks?view=all&task=${s.addTop.taskId}`} />
        ) : (
          <ActionCard
            tone="emerald"
            icon={ListPlus}
            title="Add best match to my tasks"
            detail={s.addTop.title ?? "Assess opportunities to find your best match"}
            onClick={s.addTop.run}
            running={s.addTop.running}
            disabled={!s.addTop.title}
          />
        )}
        <ActionCard
          tone="amber"
          icon={TriangleAlert}
          title={`Review ${s.clarifications} clarification${s.clarifications === 1 ? "" : "s"}`}
          detail="Mandatory requirements the agent couldn't confirm"
          href="/procurement/opportunities?eligibility=requires_clarification"
          disabled={!s.clarifications}
        />
        <ActionCard
          tone="rose"
          icon={ShieldCheck}
          title={s.unverified ? `Verify ${s.unverified} credential${s.unverified === 1 ? "" : "s"}` : "Credentials verified"}
          detail="Agents only count verified, unexpired credentials"
          href="/procurement/profile"
        />
        <ActionCard
          tone="sky"
          icon={FileUp}
          title={s.missingDocs ? `Upload ${s.missingDocs} missing document${s.missingDocs === 1 ? "" : "s"}` : "Knowledge base"}
          detail={s.missingDocs ? "Capability statement, insurance or past performance" : "Add or verify documents"}
          href="/procurement/knowledge"
        />
      </div>
    </section>
  );
}
