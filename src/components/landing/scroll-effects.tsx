"use client";

import React from "react";

/**
 * Scroll reveals for the server-rendered sections of the homepage: every
 * `.glow-card` and `[data-reveal]` fades up when it enters the viewport.
 * Content is only hidden once this script is running (the `reveal-ready`
 * class), so nothing disappears without JavaScript or with reduced motion.
 */
export function ScrollEffects() {
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.querySelector(".landing");
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>(".glow-card, [data-reveal]"));
    // Stagger siblings that share a parent.
    const byParent = new Map<Element, number>();
    for (const el of targets) {
      const i = byParent.get(el.parentElement!) ?? 0;
      el.style.setProperty("--reveal-delay", `${Math.min(i, 5) * 90}ms`);
      byParent.set(el.parentElement!, i + 1);
    }
    root.classList.add("reveal-ready");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("revealed");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);
  return null;
}

/** Endless, slowly scrolling row (pauses on hover). */
export function Marquee({ items, className }: { items: string[]; className?: string }) {
  return (
    <div className={className} style={{ maskImage: "linear-gradient(90deg, transparent, black 12%, black 88%, transparent)" }}>
      <div className="marquee-track flex w-max gap-14">
        {[...items, ...items].map((p, i) => (
          <span key={i} aria-hidden={i >= items.length || undefined} className="whitespace-nowrap">
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}
