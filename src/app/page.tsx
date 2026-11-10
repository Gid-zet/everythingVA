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

function Keycap({
  children,
  wide,
  className,
}: {
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-14 items-center justify-center rounded-xl border border-white/15 bg-gradient-to-b from-white/[0.14] to-white/[0.04] font-sans text-xl font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_-3px_0_rgba(0,0,0,0.35)_inset,0_6px_14px_-6px_rgba(0,0,0,0.6)] sm:h-16 sm:text-2xl",
        wide ? "px-5" : "w-14 sm:w-16",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

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
              <h2 className={SECTION_H2}>
                The busywork of email, done before you open it.
              </h2>
              <p className="max-w-[52ch] text-[17px] leading-relaxed text-muted-foreground lg:justify-self-end">
                Connect Gmail once. EverythingVA keeps it in sync, learns how you
                write, and handles the repetitive parts so your attention goes to
                the conversations that matter.
              </p>
            </div>

            <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-6">
              <article className="rounded-3xl border border-foreground/[0.08] bg-sidebar p-7 md:col-span-4 md:p-9">
                <h3 className={CARD_H3}>Ask your inbox anything</h3>
                <p className="mt-2 max-w-[44ch] text-muted-foreground">
                  Search by meaning, not keywords. Each answer points to the email it came from.
                </p>
                <div className="mt-8 space-y-3">
                  <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-foreground/[0.07] px-4 py-2.5 text-[14px]">
                    When does my flight to Lisbon leave?
                  </div>
                  <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-brand px-4 py-2.5 text-[14px] text-brand-foreground">
                    Friday at 7:40am, TAP 1352. It&apos;s in your booking confirmation from October 28.
                  </div>
                </div>
              </article>

              <article className="rounded-3xl border border-foreground/[0.08] bg-background p-7 md:col-span-2 md:row-span-2 md:p-8">
                <h3 className={CARD_H3}>Unsubscribe in bulk</h3>
                <p className="mt-2 text-muted-foreground">
                  See who sends you the most, then leave the lists you never read.
                </p>
                <ul className="mt-7 divide-y divide-foreground/[0.07] rounded-2xl border border-foreground/[0.08]">
                  {(
                    [
                      ["Product Hunt Daily", 186, true],
                      ["Medium Digest", 142, true],
                      ["LinkedIn", 97, false],
                      ["Notion Team", 41, true],
                      ["Figma", 23, false],
                    ] as const
                  ).map(([name, n, off]) => (
                    <li key={name} className="flex items-center gap-3 px-4 py-3 text-[14px]">
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      <span className="tabular-nums text-muted-foreground">{n}</span>
                      <span
                        className={cn(
                          "w-[92px] rounded-full py-0.5 text-center text-[11px] font-medium",
                          off
                            ? "bg-foreground text-background"
                            : "border border-foreground/15 text-muted-foreground",
                        )}
                      >
                        {off ? "Unsubscribed" : "Keep"}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-[13px] text-muted-foreground">
                  369 emails a month you&apos;ll no longer get.
                </p>
              </article>

              <article className="rounded-3xl border border-foreground/[0.08] bg-background p-7 md:col-span-2 md:p-8">
                <h3 className={CARD_H3}>Replies in your voice</h3>
                <p className="mt-2 text-muted-foreground">
                  Start typing and the rest appears. Press Tab to keep it.
                </p>
                <p className="mt-6 rounded-2xl border border-foreground/[0.08] p-4 text-[14px] leading-relaxed">
                  Thanks Daniel, section 4.2 works for us if
                  <span className="text-muted-foreground/60"> we move the notice period to 30 days. Free tomorrow at 10?</span>
                </p>
              </article>

              <article className="rounded-3xl border border-foreground/[0.08] bg-background p-7 md:col-span-2 md:p-8">
                <h3 className={CARD_H3}>Sorted on arrival</h3>
                <p className="mt-2 text-muted-foreground">
                  Rules and AI file each email. Snoozed threads come back when you need them.
                </p>
                <div className="mt-6 flex flex-wrap gap-2 text-[13px]">
                  {["Needs reply", "Waiting on", "Meetings", "Finance", "Clients", "Later"].map((c, i) => (
                    <span
                      key={c}
                      className={cn(
                        "rounded-full px-3 py-1",
                        i === 0 ? "bg-brand text-brand-foreground" : "bg-foreground/[0.06]",
                      )}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Keyboard */}
        <section id="keyboard" className="scroll-mt-16 bg-[hsl(240_9%_8%)] text-white">
          <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-14 px-5 py-24 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-32">
            <div>
              <h2 className={SECTION_H2}>Your hands never leave the keyboard.</h2>
              <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-white/60">
                Move, finish and search without reaching for the mouse. Select a
                run of threads and clear them in one keystroke.
              </p>
              <dl className="mt-10 grid max-w-md grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-[15px]">
                {[
                  ["J  K", "Next and previous thread"],
                  ["D", "Mark done"],
                  ["U", "Back to inbox"],
                  ["Shift V", "Select several threads"],
                  ["/", "Search"],
                  ["Ctrl K", "Command menu"],
                ].map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt className="whitespace-pre font-medium text-white">{k}</dt>
                    <dd className="text-white/60">{v}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
            <div className="flex flex-col items-center gap-3 sm:gap-4" aria-hidden>
              <div className="flex gap-3 sm:gap-4">
                <Keycap>J</Keycap>
                <Keycap>K</Keycap>
                <Keycap className="border-[hsl(var(--brand)/0.7)] from-[hsl(var(--brand))] to-[hsl(var(--brand)/0.7)]">
                  D
                </Keycap>
                <Keycap>U</Keycap>
              </div>
              <div className="flex gap-3 sm:gap-4">
                <Keycap wide>Shift</Keycap>
                <Keycap>V</Keycap>
                <Keycap>/</Keycap>
              </div>
              <div className="flex gap-3 sm:gap-4">
                <Keycap wide>Ctrl</Keycap>
                <Keycap>K</Keycap>
              </div>
            </div>
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
