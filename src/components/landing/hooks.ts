"use client";

import React from "react";

export function useReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** True while the element is at least `threshold` visible. */
export function useInView<T extends Element>(threshold = 0.35) {
  const ref = React.useRef<T>(null);
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

/** Reveal `text` character by character after `start` flips true (instant with reduced motion). */
export function useTypewriter(text: string, start: boolean, speed = 18) {
  const reduced = useReducedMotion();
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (!start) {
      setN(0);
      return;
    }
    if (reduced) {
      setN(text.length);
      return;
    }
    setN(0);
    let i = 0;
    const t = setInterval(() => {
      i += 2;
      setN(Math.min(i, text.length));
      if (i >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text, start, reduced, speed]);
  return { shown: text.slice(0, n), done: n >= text.length };
}
