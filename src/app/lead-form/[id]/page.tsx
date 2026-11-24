import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/server/db";
import { LeadFormClient } from "./lead-form-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const form = await db.leadForm.findUnique({ where: { id: params.id }, select: { title: true } });
  return { title: form?.title ?? "Get in touch", robots: { index: false } };
}

export default async function LeadFormPage({ params }: { params: { id: string } }) {
  const form = await db.leadForm.findUnique({
    where: { id: params.id },
    select: { id: true, title: true, intro: true, askCompany: true, askPhone: true, askMessage: true, active: true, user: { select: { firstName: true, lastName: true } } },
  });
  if (!form) notFound();
  const owner = [form.user.firstName, form.user.lastName].filter(Boolean).join(" ") || "us";
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f4f2] px-4 py-12 dark:bg-background">
      <div className="w-full max-w-md rounded-3xl bg-card p-7 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.35)] ring-1 ring-border">
        <p className="text-[13px] font-medium text-muted-foreground">Get in touch</p>
        <h1 className="font-tight text-[30px] font-bold leading-tight tracking-[-0.04em]">{form.title}</h1>
        {form.intro && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{form.intro}</p>}
        {form.active ? (
          <LeadFormClient id={form.id} owner={owner} askCompany={form.askCompany} askPhone={form.askPhone} askMessage={form.askMessage} />
        ) : (
          <p className="mt-6 rounded-xl bg-muted p-4 text-sm text-muted-foreground">This form isn&apos;t accepting responses right now.</p>
        )}
      </div>
    </main>
  );
}
