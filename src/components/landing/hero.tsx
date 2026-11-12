"use client";

import React from "react";
import { ArrowRight } from "lucide-react";
import { HeroInbox } from "./hero-inbox";

/**
 * Hero: a quiet, editorial headline over a lit product window.
 * The window's own demo (an inbox clearing itself) is the visual.
 */
export function Hero({ actions }: { actions: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden">
      {/* Spotlight from above */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-280px] h-[760px] w-[1100px] -translate-x-1/2"
        style={{ background: "radial-gradient(closest-side, rgb(255 255 255 / 0.09), transparent)" }}
      />
      <div className="relative mx-auto max-w-[1200px] px-5 pb-24 pt-20 sm:px-8 lg:pb-32 lg:pt-28">
        <div className="mx-auto max-w-[880px] text-center">
          <a
            href="#organizer"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[13px] text-white/70 backdrop-blur transition-colors hover:border-white/20 hover:text-white"
          >
            <span className="rounded-full bg-[hsl(var(--brand))] px-1.5 text-[11px] font-medium text-white">New</span>
            Rules that organize your inbox for you
            <ArrowRight className="size-3.5" />
          </a>

          <h1 className="mt-8 font-serif text-[clamp(3.25rem,9vw,6.5rem)] font-normal leading-[0.98] tracking-[-0.02em] text-gradient">
            Your inbox,
            <br />
            handled.
          </h1>
          <p className="mx-auto mt-7 max-w-[54ch] text-[18px] leading-[1.6] text-[hsl(var(--muted-foreground))]">
            An AI assistant for Gmail, Outlook and iCloud. It drafts replies in your voice, clears out what you don&apos;t
            need, and keeps your calendar beside your mail.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">{actions}</div>
        </div>

        <div className="relative mx-auto mt-20 max-w-[860px]">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-24 -top-16 bottom-0 -z-0"
            style={{ background: "radial-gradient(60% 50% at 50% 0%, hsl(var(--brand) / 0.18), transparent 70%)" }}
          />
          <HeroInbox />
        </div>
      </div>
    </section>
  );
}
