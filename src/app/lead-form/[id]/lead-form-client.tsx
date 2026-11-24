"use client";
import React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];
const field = "mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none transition focus:border-foreground/40 focus:ring-2 focus:ring-ring/20";

export function LeadFormClient({ id, owner, askCompany, askPhone, askMessage }: { id: string; owner: string; askCompany: boolean; askPhone: boolean; askMessage: boolean }) {
  const [state, setState] = React.useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [thanks, setThanks] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams(window.location.search);
    const attribution: Record<string, string> = {};
    for (const k of KEYS) {
      const v = params.get(k);
      if (v) attribution[k] = v;
    }
    if (document.referrer) attribution.referrer = document.referrer;
    attribution.landing = window.location.href.split("#")[0]!;
    setState("sending");
    try {
      const res = await fetch(`/api/leads/form/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email"),
          company: fd.get("company") || undefined,
          phone: fd.get("phone") || undefined,
          message: fd.get("message") || undefined,
          consent: fd.get("consent") === "on",
          website: (fd.get("website") as string) || undefined,
          attribution,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; thankYou?: string | null };
      if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
      setThanks(json.thankYou ?? null);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
    }
  }

  if (state === "done")
    return (
      <div className="mt-6 flex flex-col items-center rounded-2xl bg-emerald-50 p-6 text-center dark:bg-emerald-500/10">
        <CheckCircle2 className="size-8 text-emerald-600" />
        <p className="mt-2 font-semibold">Thanks, we&apos;ve got it.</p>
        <p className="text-sm text-muted-foreground">{thanks ?? `${owner} will be in touch soon.`}</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <label className="block text-[13px] font-medium">
        Name
        <input name="name" required maxLength={160} autoComplete="name" className={field} />
      </label>
      <label className="block text-[13px] font-medium">
        Work email
        <input name="email" type="email" required maxLength={254} autoComplete="email" className={field} />
      </label>
      {askCompany && (
        <label className="block text-[13px] font-medium">
          Company
          <input name="company" maxLength={160} autoComplete="organization" className={field} />
        </label>
      )}
      {askPhone && (
        <label className="block text-[13px] font-medium">
          Phone <span className="font-normal text-muted-foreground">(optional)</span>
          <input name="phone" type="tel" maxLength={60} autoComplete="tel" className={field} />
        </label>
      )}
      {askMessage && (
        <label className="block text-[13px] font-medium">
          How can we help?
          <textarea name="message" rows={4} maxLength={5000} className={field} />
        </label>
      )}
      {/* Honeypot: hidden from people, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="flex items-start gap-2 text-[13px] text-muted-foreground">
        <input name="consent" type="checkbox" required className="mt-0.5 size-4 accent-foreground" />
        <span>I agree that {owner} may store these details and contact me about my enquiry. I can ask for them to be deleted at any time.</span>
      </label>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
      <button disabled={state === "sending"} className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60">
        {state === "sending" && <Loader2 className="size-4 animate-spin" />}
        Send
      </button>
    </form>
  );
}
