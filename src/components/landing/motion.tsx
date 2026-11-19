"use client";

import React from "react";
import { animate, motion, useInView, useReducedMotion, type Variants } from "framer-motion";

/** Fade and rise into place the first time it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "section" | "article" | "li" | "p" | "h2";
}) {
  const reduce = useReducedMotion();
  const M = motion[as];
  return (
    <M
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-12% 0px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </M>
  );
}

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 26, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

/** A group whose direct `StaggerItem`s reveal one after another. */
export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} variants={container} initial={reduce ? false : "hidden"} whileInView="show" viewport={{ once: true, margin: "-10% 0px" }}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "article" }) {
  const M = motion[as];
  return (
    <M className={className} variants={item}>
      {children}
    </M>
  );
}

/** Counts up to `to` when it scrolls into view. */
export function CountIn({ to, suffix = "", className }: { to: number; suffix?: string; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const [v, setV] = React.useState(reduce ? to : 0);
  React.useEffect(() => {
    if (!inView || reduce) return;
    const c = animate(0, to, { duration: 1.4, ease: [0.22, 1, 0.36, 1], onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [inView, reduce, to]);
  return (
    <span ref={ref} className={className}>
      {v}
      {suffix}
    </span>
  );
}

/** Bar that fills to `pct` when it scrolls into view. */
export function FillBar({ pct, className, barClassName }: { pct: number; className?: string; barClassName?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={className}>
      <motion.div
        className={barClassName}
        initial={reduce ? false : { width: 0 }}
        whileInView={{ width: `${pct}%` }}
        viewport={{ once: true, margin: "-10% 0px" }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        style={reduce ? { width: `${pct}%` } : undefined}
      />
    </div>
  );
}
