"use client";

import React from "react";
import { HeroInbox } from "./hero-inbox";

/**
 * Hero: the unread count is the headline. It ticks down in step with the
 * inbox demo on the right, so the type itself shows what the product does.
 */
export function Hero({ actions }: { actions: React.ReactNode }) {
  const [count, setCount] = React.useState(1284);
  const onCount = React.useCallback((n: number) => setCount(n), []);
  const zero = count === 0;

  return (
    <section className="relative mx-auto grid max-w-[1200px] grid-cols-1 gap-14 px-5 pb-28 pt-14 sm:px-8 lg:grid-cols-[1fr_1.02fr] lg:items-center lg:gap-16 lg:pb-36 lg:pt-20">
      <div className="min-w-0 max-w-[560px]">
        <p
          aria-hidden
          className="font-display text-[clamp(4.5rem,11vw,8.75rem)] font-bold leading-[0.85] tracking-[-0.055em] tabular-nums"
        >
          <span
            className={
              zero
                ? "text-brand transition-colors duration-700"
                : "text-foreground transition-colors duration-700"
            }
          >
            {count.toLocaleString("en-US")}
          </span>
          <span className="ml-3 align-baseline text-[0.24em] font-medium tracking-[-0.02em] text-muted-foreground">
            unread
          </span>
        </p>

        <h1 className="mt-8 font-display text-[clamp(1.9rem,3.6vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-balance">
          An assistant that gets your inbox to zero, and keeps it there.
        </h1>
        <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-muted-foreground">
          EverythingVA reads your email, drafts replies in your voice, clears
          out newsletters, and puts meetings on your calendar. You only
          touch what needs you.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">{actions}</div>
        <p className="mt-5 text-[13px] text-muted-foreground">
          Works with Gmail, Outlook and iCloud. Free to start, no card needed.
        </p>
      </div>

      <div className="min-w-0">
        <HeroInbox onCount={onCount} />
      </div>
    </section>
  );
}
