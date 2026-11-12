import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Bricolage_Grotesque } from "next/font/google";
import { Check } from "lucide-react";
import {
  LoginLink,
  RegisterLink,
} from "@kinde-oss/kinde-auth-nextjs/components";

import { getKindeServerSession } from "@/lib/kinde";
import { ModeToggle } from "@/components/theme-toggle";
import { Hero } from "@/components/landing/hero";
import { AskDemo, DraftDemo, OrganizerDemo, UnsubscribeDemo } from "@/components/landing/feature-demos";
import { CalendarDemo } from "@/components/landing/calendar-demo";
import { KeyboardDemo } from "@/components/landing/keyboard-demo";
import { cn } from "@/lib/utils";
import {
  FREE_ACCOUNTS_PER_USER,
  FREE_CREDITS_PER_DAY,
  PRO_ACCOUNTS_PER_USER,
} from "@/app/constants";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const primaryBtn =
  "inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-[15px] font-medium text-background shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_8px_20px_-8px_rgba(0,0,0,0.4)] transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const secondaryBtn =
  "inline-flex h-11 items-center justify-center rounded-full border border-foreground/15 px-6 text-[15px] font-medium transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const invertedBtn =
  "inline-flex h-11 items-center rounded-full bg-background px-6 text-[15px] font-medium text-foreground transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const SECTION_H2 =
  "font-display text-[clamp(2rem,4.2vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-balance";
const CARD_H3 = "font-display text-2xl font-semibold tracking-[-0.025em]";

const LandingPage = async () => {
  const { getUser } = getKindeServerSession();
  const user = await getUser();
  const signedIn = !!user?.id;

  const heroActions = signedIn ? (
    <Link href="/mail" className={primaryBtn}>
      Open your inbox
    </Link>
  ) : (
    <>
      <RegisterLink className={primaryBtn}>Start free</RegisterLink>
      <LoginLink className={secondaryBtn}>Sign in</LoginLink>
    </>
  );

  return (
    <div
      className={cn(
        display.variable,
        "relative min-h-screen overflow-x-hidden bg-background text-foreground",
      )}
    >
      {/* One quiet light behind the hero, nothing else decorative */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[760px] bg-[radial-gradient(55%_60%_at_72%_18%,hsl(var(--brand)/0.11),transparent_70%)]"
      />

      <header className="sticky top-0 z-40 bg-background/70 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-5 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="EverythingVA home"
          >
            <Image src="/logo.png" alt="" width={28} height={28} className="rounded-lg dark:invert" />
            <span className="font-display text-[17px] font-semibold tracking-[-0.02em]">
              EverythingVA
            </span>
          </Link>
          <div className="hidden items-center gap-6 text-[14px] text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#calendar" className="transition-colors hover:text-foreground">Calendar</a>
            <a href="#keyboard" className="transition-colors hover:text-foreground">Shortcuts</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
            {signedIn ? (
              <Link href="/mail" className={cn(primaryBtn, "h-9 px-4 text-[14px]")}>
                Open inbox
              </Link>
            ) : (
              <>
                <LoginLink className="hidden px-3 text-[14px] text-muted-foreground transition-colors hover:text-foreground sm:inline">
                  Sign in
                </LoginLink>
                <RegisterLink className={cn(primaryBtn, "h-9 px-4 text-[14px]")}>
                  Start free
                </RegisterLink>
              </>
            )}
          </div>
        </nav>
      </header>

      <main className="relative">
        <Hero actions={heroActions} />

        {/* What it does */}
        <section id="features" className="scroll-mt-20 border-t border-foreground/[0.07]">
          <div className="mx-auto max-w-[1200px] px-5 py-24 sm:px-8 lg:py-32">
            <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr] lg:items-end">
              <h2 className={SECTION_H2}>The busywork of email, done before you open it.</h2>
              <p className="max-w-[52ch] text-[17px] leading-relaxed text-muted-foreground lg:justify-self-end">
                Connect Gmail or Outlook once. EverythingVA keeps it in sync, learns how you write, and handles the
                repetitive parts. Everything below is live: try it.
              </p>
            </div>

            <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-6">
              <article className="rounded-3xl border border-foreground/[0.08] bg-sidebar p-7 md:col-span-4 md:p-9">
                <h3 className={CARD_H3}>Ask your inbox anything</h3>
                <p className="mt-2 max-w-[44ch] text-muted-foreground">
                  Search by meaning, not keywords. Each answer points to the email it came from.
                </p>
                <div className="mt-8">
                  <AskDemo />
                </div>
              </article>

              <article className="rounded-3xl border border-foreground/[0.08] bg-background p-7 md:col-span-2 md:p-8">
                <h3 className={CARD_H3}>Unsubscribe in bulk</h3>
                <p className="mt-2 text-muted-foreground">See who sends you the most, then leave the lists you never read.</p>
                <UnsubscribeDemo />
              </article>

              <article className="rounded-3xl border border-foreground/[0.08] bg-background p-7 md:col-span-4 md:p-9">
                <h3 className={CARD_H3}>Rules that run themselves</h3>
                <p className="mt-2 max-w-[48ch] text-muted-foreground">
                  Describe a rule in plain English. New mail gets labelled, starred or archived in your real mailbox, and
                  every change can be undone.
                </p>
                <OrganizerDemo />
              </article>

              <article className="flex flex-col rounded-3xl border border-foreground/[0.08] bg-sidebar p-7 md:col-span-2 md:p-8">
                <h3 className={CARD_H3}>Replies in your voice</h3>
                <p className="mt-2 text-muted-foreground">
                  Start typing and the rest of the sentence appears. Keep it with one key, or let the AI draft the whole
                  reply.
                </p>
                <div className="mt-auto">
                  <DraftDemo />
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Calendar */}
        <section id="calendar" className="scroll-mt-20 border-t border-foreground/[0.07] bg-sidebar">
          <div className="mx-auto max-w-[1200px] px-5 py-24 sm:px-8 lg:py-32">
            <div className="max-w-[640px]">
              <h2 className={SECTION_H2}>Your calendar lives next to your inbox.</h2>
              <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-muted-foreground">
                Google and Outlook calendars side by side. Turn an email into an event, answer invites, and see when
                guests are free, without opening another app.
              </p>
            </div>
            <div className="mt-12">
              <CalendarDemo />
            </div>
          </div>
        </section>

        {/* Keyboard */}
        <section id="keyboard" className="scroll-mt-16 overflow-hidden bg-[hsl(240_9%_8%)] text-white">
          <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:py-32">
            <div>
              <h2 className={SECTION_H2}>Your hands never leave the keyboard.</h2>
              <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-white/60">
                Move, finish and search without reaching for the mouse. Select a run of threads and clear them in one
                keystroke.
              </p>
              <dl className="mt-10 grid max-w-md grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-[15px]">
                {[
                  ["J  K", "Next and previous thread"],
                  ["E", "Archive"],
                  ["S", "Star"],
                  ["H", "Snooze until tomorrow"],
                  ["Shift V", "Select several threads"],
                  ["/", "Search"],
                ].map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt className="whitespace-pre font-medium text-white">{k}</dt>
                    <dd className="text-white/60">{v}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
            <KeyboardDemo />
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20">
          <div className="mx-auto max-w-[1200px] px-5 py-24 sm:px-8 lg:py-32">
            <h2 className={cn(SECTION_H2, "max-w-[18ch]")}>
              Start free. Upgrade when it earns it.
            </h2>
            <div className="mt-14 grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-foreground/[0.1] p-8 md:p-10">
                <h3 className={CARD_H3}>Free</h3>
                <p className="mt-1 text-muted-foreground">Try it on your real inbox.</p>
                <ul className="mt-8 space-y-3 text-[15px]">
                  {[
                    `${FREE_CREDITS_PER_DAY} AI questions a day`,
                    `Up to ${FREE_ACCOUNTS_PER_USER} email accounts`,
                    "AI drafts, search and organizer",
                    "Bulk unsubscribe and snooze",
                  ].map((f) => (
                    <li key={f} className="flex gap-3">
                      <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-10">
                  {signedIn ? (
                    <Link href="/mail" className={secondaryBtn}>Open your inbox</Link>
                  ) : (
                    <RegisterLink className={secondaryBtn}>Start free</RegisterLink>
                  )}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-3xl bg-foreground p-8 text-background md:p-10">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[hsl(var(--brand)/0.55)] blur-3xl"
                />
                <h3 className={cn(CARD_H3, "relative")}>Pro</h3>
                <p className="relative mt-1 text-background/65">For people who live in their inbox.</p>
                <ul className="relative mt-8 space-y-3 text-[15px]">
                  {[
                    "Unlimited AI questions",
                    `Up to ${PRO_ACCOUNTS_PER_USER} email accounts`,
                    "Everything in Free",
                    "Manage or cancel anytime in the app",
                  ].map((f) => (
                    <li key={f} className="flex gap-3">
                      <Check className="mt-0.5 size-4 shrink-0 text-[hsl(var(--brand))]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="relative mt-10">
                  {signedIn ? (
                    <Link href="/mail" className={invertedBtn}>Upgrade from your inbox</Link>
                  ) : (
                    <RegisterLink className={invertedBtn}>Start free, upgrade later</RegisterLink>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-foreground/[0.07]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-5 py-10 text-[14px] text-muted-foreground sm:flex-row sm:items-center sm:px-8">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="" width={22} height={22} className="rounded-md dark:invert" />
            <span className="font-display font-semibold text-foreground">EverythingVA</span>
          </div>
          <div className="flex gap-6 sm:ml-auto">
            <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
            <Link href="/terms-of-service" className="transition-colors hover:text-foreground">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
