import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Bricolage_Grotesque, Instrument_Serif } from "next/font/google";
import { Check, KeyRound, LockKeyhole, Unplug } from "lucide-react";
import { LoginLink, RegisterLink } from "@kinde-oss/kinde-auth-nextjs/components";

import { getKindeServerSession } from "@/lib/kinde";
import { Hero } from "@/components/landing/hero";
import { AskDemo, DraftDemo, OrganizerDemo, UnsubscribeDemo } from "@/components/landing/feature-demos";
import { CalendarDemo } from "@/components/landing/calendar-demo";
import { KeyboardDemo } from "@/components/landing/keyboard-demo";
import { cn } from "@/lib/utils";
import { FREE_ACCOUNTS_PER_USER, FREE_CREDITS_PER_DAY, PRO_ACCOUNTS_PER_USER } from "@/app/constants";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-serif", display: "swap" });

const primaryBtn =
  "inline-flex h-11 items-center justify-center rounded-[14px] bg-white px-5 text-[14px] font-semibold text-black transition-all hover:bg-white/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black";
const secondaryBtn =
  "inline-flex h-11 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.03] px-5 text-[14px] font-semibold text-white/80 transition-colors hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50";

/** Section heading: light grotesk with a white→fade fill; `dim` part is quieter. */
function Heading({ children, dim, className }: { children: React.ReactNode; dim?: React.ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        "max-w-[18ch] text-balance font-sans text-[clamp(2.25rem,5vw,3.5rem)] font-normal leading-[1.05] tracking-[-0.045em]",
        className,
      )}
    >
      <span className="text-gradient">{children}</span>
      {dim && <span className="text-white/40"> {dim}</span>}
    </h2>
  );
}

const Lead = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <p className={cn("mt-5 max-w-[54ch] text-[18px] leading-[1.6] text-[hsl(var(--muted-foreground))]", className)}>{children}</p>
);

const CardTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[18px] font-medium tracking-[-0.01em] text-white">{children}</h3>
);
const CardText = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-1.5 max-w-[46ch] text-[14px] leading-relaxed text-[hsl(var(--muted-foreground))]">{children}</p>
);

const LandingPage = async () => {
  const { getUser } = getKindeServerSession();
  const user = await getUser();
  const signedIn = !!user?.id;

  const cta = signedIn ? (
    <Link href="/mail" className={primaryBtn}>
      Open your inbox
    </Link>
  ) : (
    <>
      <RegisterLink className={primaryBtn}>Get started</RegisterLink>
      <LoginLink className={secondaryBtn}>Sign in</LoginLink>
    </>
  );

  return (
    <div className={cn(display.variable, serif.variable, "dark landing min-h-screen overflow-x-hidden text-[hsl(var(--foreground))] antialiased")}>
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-black/60 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50" aria-label="EverythingVA home">
            <Image src="/logo.png" alt="" width={24} height={24} className="rounded-md invert" />
            <span className="text-[16px] font-semibold tracking-[-0.02em] text-white">EverythingVA</span>
          </Link>
          <div className="hidden items-center gap-6 text-[14px] text-white/60 md:flex">
            {[
              ["Features", "#features"],
              ["Organizer", "#organizer"],
              ["Calendar", "#calendar"],
              ["Shortcuts", "#keyboard"],
              ["Pricing", "#pricing"],
            ].map(([label, href]) => (
              <a key={href} href={href} className="transition-colors hover:text-white">
                {label}
              </a>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {signedIn ? (
              <Link href="/mail" className={cn(primaryBtn, "h-9 rounded-xl px-4 text-[13px]")}>
                Open inbox
              </Link>
            ) : (
              <>
                <LoginLink className="hidden px-3 text-[14px] text-white/60 transition-colors hover:text-white sm:inline">Log in</LoginLink>
                <RegisterLink className={cn(secondaryBtn, "h-9 rounded-xl px-4 text-[13px] text-white")}>Get started</RegisterLink>
              </>
            )}
          </div>
        </nav>
      </header>

      <main>
        <Hero actions={cta} />

        {/* Providers */}
        <section aria-label="Works with" className="mx-auto max-w-[1200px] px-5 pb-24 sm:px-8">
          <p className="text-center text-[14px] text-white/45">Works with the inbox you already have</p>
          <ul className="mx-auto mt-6 flex max-w-[760px] flex-wrap items-center justify-center gap-x-10 gap-y-4 text-[19px] font-medium tracking-[-0.02em] text-white/55">
            {["Gmail", "Google Workspace", "Outlook", "Microsoft 365", "iCloud", "IMAP"].map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>

        <div className="hairline-x mx-auto max-w-[1200px]" />

        {/* Features */}
        <section id="features" className="scroll-mt-20">
          <div className="mx-auto max-w-[1200px] px-5 py-28 sm:px-8 lg:py-36">
            <Heading dim="Try it right here.">Everything your inbox should already do.</Heading>
            <Lead>Each card below is the real interaction, running in your browser. No sign-up needed to play.</Lead>

            <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-6">
              <article className="glow-card p-7 md:col-span-4 md:p-9">
                <CardTitle>Ask your inbox anything</CardTitle>
                <CardText>Search by meaning, not keywords. Each answer points to the email it came from.</CardText>
                <div className="mt-8">
                  <AskDemo />
                </div>
              </article>

              <article className="glow-card p-7 md:col-span-2 md:p-8">
                <CardTitle>Unsubscribe in bulk</CardTitle>
                <CardText>See who sends the most, then leave the lists you never read.</CardText>
                <UnsubscribeDemo />
              </article>

              <article id="organizer" className="glow-card scroll-mt-24 p-7 md:col-span-4 md:p-9">
                <CardTitle>Rules that run themselves</CardTitle>
                <CardText>
                  Describe a rule in plain English. New mail is labelled, starred or archived in your real mailbox, and
                  every change can be undone.
                </CardText>
                <OrganizerDemo />
              </article>

              <article className="glow-card flex flex-col p-7 md:col-span-2 md:p-8">
                <CardTitle>Replies in your voice</CardTitle>
                <CardText>The rest of the sentence appears as you type. Keep it with one key.</CardText>
                <div className="mt-auto">
                  <DraftDemo />
                </div>
              </article>
            </div>
          </div>
        </section>

        <div className="hairline-x mx-auto max-w-[1200px]" />

        {/* Calendar */}
        <section id="calendar" className="scroll-mt-20">
          <div className="mx-auto max-w-[1200px] px-5 py-28 sm:px-8 lg:py-36">
            <Heading dim="Not in another tab.">Your calendar, beside your inbox.</Heading>
            <Lead>
              Google and Outlook calendars side by side. Turn an email into an event, answer invitations and see when
              guests are free.
            </Lead>
            <div className="glow-card mt-14 p-4 sm:p-6">
              <CalendarDemo />
            </div>
          </div>
        </section>

        <div className="hairline-x mx-auto max-w-[1200px]" />

        {/* Keyboard */}
        <section id="keyboard" className="scroll-mt-16">
          <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-14 px-5 py-28 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:py-36">
            <div>
              <Heading dim="Your hands stay on the keys.">Built for speed.</Heading>
              <Lead>Move, finish and search without the mouse. Select a run of threads and clear them in one keystroke.</Lead>
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
                    <dt className="whitespace-pre font-mono text-[13px] text-white">{k}</dt>
                    <dd className="text-white/55">{v}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
            <div className="glow-card p-5 sm:p-7">
              <KeyboardDemo />
            </div>
          </div>
        </section>

        <div className="hairline-x mx-auto max-w-[1200px]" />

        {/* Trust */}
        <section aria-labelledby="trust" className="mx-auto max-w-[1200px] px-5 py-28 sm:px-8 lg:py-36">
          <Heading dim="Always.">
            <span id="trust">You stay in control.</span>
          </Heading>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: KeyRound,
                title: "We never see your password",
                text: "You sign in on Google's, Microsoft's or your mail server's own page. We receive an access grant, nothing more.",
              },
              {
                icon: LockKeyhole,
                title: "Encrypted at rest",
                text: "Access tokens are encrypted on our servers and never sent to your browser.",
              },
              {
                icon: Unplug,
                title: "Leave whenever you like",
                text: "Disconnecting revokes access and deletes our copy. Nothing is removed from your mailbox.",
              },
            ].map((f) => (
              <div key={f.title} className="glow-card p-7">
                <span className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                  <f.icon className="size-[18px] text-white/80" />
                </span>
                <h3 className="mt-6 text-[16px] font-medium text-white">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-[hsl(var(--muted-foreground))]">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="hairline-x mx-auto max-w-[1200px]" />

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20">
          <div className="mx-auto max-w-[1200px] px-5 py-28 sm:px-8 lg:py-36">
            <Heading dim="Upgrade when it earns it.">Start free.</Heading>
            <div className="mt-14 grid gap-4 md:grid-cols-2">
              <div className="glow-card p-8 md:p-10">
                <h3 className="text-[18px] font-medium text-white">Free</h3>
                <p className="mt-1 text-[14px] text-[hsl(var(--muted-foreground))]">Try it on your real inbox.</p>
                <ul className="mt-8 space-y-3 text-[15px] text-white/85">
                  {[
                    `${FREE_CREDITS_PER_DAY} AI questions a day`,
                    `Up to ${FREE_ACCOUNTS_PER_USER} email accounts`,
                    "Organizer rules, drafts and search",
                    "Calendar, bulk unsubscribe and snooze",
                  ].map((f) => (
                    <li key={f} className="flex gap-3">
                      <Check className="mt-0.5 size-4 shrink-0 text-white/40" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-10">
                  {signedIn ? (
                    <Link href="/mail" className={secondaryBtn}>Open your inbox</Link>
                  ) : (
                    <RegisterLink className={secondaryBtn}>Get started</RegisterLink>
                  )}
                </div>
              </div>
              <div className="glow-card overflow-hidden p-8 md:p-10">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full blur-3xl"
                  style={{ background: "hsl(var(--brand) / 0.25)" }}
                />
                <h3 className="relative text-[18px] font-medium text-white">Pro</h3>
                <p className="relative mt-1 text-[14px] text-[hsl(var(--muted-foreground))]">For people who live in their inbox.</p>
                <ul className="relative mt-8 space-y-3 text-[15px] text-white/85">
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
                    <Link href="/mail" className={primaryBtn}>Upgrade from your inbox</Link>
                  ) : (
                    <RegisterLink className={primaryBtn}>Start free, upgrade later</RegisterLink>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="relative overflow-hidden border-t border-white/[0.06]">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2"
            style={{ background: "radial-gradient(closest-side, rgb(255 255 255 / 0.08), transparent)" }}
          />
          <div className="relative mx-auto max-w-[1200px] px-5 py-32 text-center sm:px-8 lg:py-44">
            <h2 className="mx-auto max-w-[14ch] font-serif text-[clamp(3rem,8vw,5.5rem)] font-normal leading-[1] tracking-[-0.02em] text-gradient">
              Get your hours back.
            </h2>
            <p className="mx-auto mt-6 max-w-[44ch] text-[18px] text-[hsl(var(--muted-foreground))]">
              Connect an inbox in under a minute. Free to start, no card needed.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">{cta}</div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-5 py-10 text-[13px] text-white/45 sm:flex-row sm:items-center sm:px-8">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="" width={20} height={20} className="rounded-md invert" />
            <span className="font-semibold text-white/80">EverythingVA</span>
          </div>
          <div className="flex gap-6 sm:ml-auto">
            <Link href="/privacy" className="transition-colors hover:text-white">Privacy</Link>
            <Link href="/terms-of-service" className="transition-colors hover:text-white">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
