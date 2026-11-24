"use client";
import React from "react";
import { toast } from "sonner";
import { Check, Copy, FileInput, Globe, Inbox, Landmark, Loader2, Plus, Table2, Trash2 } from "lucide-react";
import { WebProspector } from "./web-prospector";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Candidate, LeadForm, LeadsStore } from "./store";

const field = "w-full rounded-xl bg-background px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-foreground/30";
const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2 text-[13px] font-semibold text-background hover:opacity-90 disabled:opacity-50";
const ghost = "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium ring-1 ring-border hover:bg-muted";

function Shell({ open, onClose, title, desc, children, wide }: { open: boolean; onClose: () => void; title: string; desc: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto rounded-3xl", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <DialogTitle className="font-tight text-2xl font-bold tracking-[-0.03em]">{title}</DialogTitle>
        <DialogDescription>{desc}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}

type Tab = "web" | "inbox" | "procurement" | "csv";

export function FindLeadsDialog({ store, open, onClose, onForms, onProfile }: { store: LeadsStore; open: boolean; onClose: () => void; onForms: () => void; onProfile: () => void }) {
  const [tab, setTab] = React.useState<Tab>("web");
  const [results, setResults] = React.useState<Partial<Record<Tab, Candidate[]>>>({});
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [csv, setCsv] = React.useState("");

  const list = tab === "csv" || tab === "web" ? undefined : results[tab];

  async function scan(t: "inbox" | "procurement") {
    setBusy(true);
    try {
      const r = t === "inbox" ? await store.scanInbox() : await store.procurementContacts();
      setResults((x) => ({ ...x, [t]: r }));
      // Preselect the warm ones.
      setPicked(new Set(r.filter((c) => c.warmth >= 40).slice(0, 20).map((c) => c.email)));
    } catch {
      /* toast shown by the store */
    } finally {
      setBusy(false);
    }
  }

  async function importPicked() {
    if (!list || tab === "csv" || tab === "web") return;
    const chosen = list.filter((c) => picked.has(c.email));
    if (!chosen.length) return;
    setBusy(true);
    try {
      const r = await store.importCandidates(
        chosen.slice(0, 100).map((c) => ({
          email: c.email,
          name: c.name,
          company: c.company,
          domain: c.domain,
          phone: c.phone ?? null,
          source: tab,
          sourceRef: c.sourceRef ?? null,
          sourceDetail: c.sourceDetail ?? null,
        })),
      );
      toast.success(`Added ${r.created} ${r.created === 1 ? "lead" : "leads"}`);
      setResults((x) => ({ ...x, [tab]: list.filter((c) => !picked.has(c.email)) }));
      setPicked(new Set());
    } catch {
      /* toast shown */
    } finally {
      setBusy(false);
    }
  }

  async function importCsv() {
    setBusy(true);
    try {
      const r = await store.importCsv(csv);
      toast.success(`Imported ${r.created} ${r.created === 1 ? "lead" : "leads"}${r.skipped ? `, skipped ${r.skipped} duplicates` : ""}`);
      setCsv("");
      onClose();
    } catch {
      /* toast shown */
    } finally {
      setBusy(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "web", label: "Web", icon: Globe },
    { id: "inbox", label: "Mailbox", icon: Inbox },
    { id: "procurement", label: "Tenders", icon: Landmark },
    { id: "csv", label: "Import CSV", icon: Table2 },
  ];

  return (
    <Shell open={open} onClose={onClose} wide title="Find leads" desc="Search the web for companies that match your ideal customer, or start from people who already know you. Nothing is sent automatically.">
      <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-0.5">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => (setTab(id), setPicked(new Set()))}
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium", tab === id ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground")}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
        <button onClick={onForms} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <FileInput className="size-3.5" /> Form
        </button>
      </div>

      {tab === "web" ? (
        <WebProspector store={store} onNeedProfile={onProfile} />
      ) : tab === "csv" ? (
        <div className="space-y-2">
          <p className="text-[12px] text-muted-foreground">Paste a CSV with a header row. Recognised columns: Name, Email, Company, Title, Phone, Website, Location, Notes. Duplicates are skipped.</p>
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} placeholder={"Name,Email,Company,Title\nDana Ruiz,dana@northwind.com,Northwind,Head of People"} className={cn(field, "font-mono text-[12px]")} />
          <label className={cn(ghost, "cursor-pointer")}>
            Choose file
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setCsv(await f.text());
              }}
            />
          </label>
          <div className="flex justify-end">
            <button disabled={!csv.trim() || busy} onClick={importCsv} className={primary}>
              {busy && <Loader2 className="size-4 animate-spin" />} Import
            </button>
          </div>
        </div>
      ) : !list ? (
        <div className="rounded-2xl border border-dashed p-6 text-center">
          <p className="text-[13px] text-muted-foreground">
            {tab === "inbox"
              ? "Looks through the last 12 months of your mail for real people you've corresponded with, skipping newsletters, no-reply senders, colleagues and anyone you unsubscribed from."
              : "Collects the buyer contacts named on tenders in your procurement workspace, best-fit tenders first."}
          </p>
          <button disabled={busy} onClick={() => scan(tab)} className={cn(primary, "mt-4")}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {tab === "inbox" ? "Scan my mailbox" : "Collect tender contacts"}
          </button>
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-center text-[13px] text-muted-foreground">No new contacts found. Everyone relevant may already be a lead.</p>
      ) : (
        <>
          <div className="flex items-center justify-between text-[12px] text-muted-foreground">
            <span>{list.length} found, ranked by warmth</span>
            <button onClick={() => setPicked(picked.size === list.length ? new Set() : new Set(list.map((c) => c.email)))} className="font-medium hover:text-foreground">
              {picked.size === list.length ? "Clear" : "Select all"}
            </button>
          </div>
          <div className="max-h-[45vh] overflow-y-auto rounded-2xl ring-1 ring-border">
            {list.map((c) => {
              const on = picked.has(c.email);
              return (
                <label key={c.email} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const s = new Set(picked);
                      if (on) s.delete(c.email);
                      else s.add(c.email);
                      setPicked(s);
                    }}
                    className="size-4 accent-foreground"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">
                      {c.name ?? c.email}
                      {c.company && <span className="font-normal text-muted-foreground"> · {c.company}</span>}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {c.name ? `${c.email} · ` : ""}
                      {c.why}
                    </span>
                  </span>
                  <span className="hidden w-20 shrink-0 sm:block" title={`Warmth ${c.warmth}`}>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500" style={{ width: `${c.warmth}%` }} />
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <button disabled={busy} onClick={() => scan(tab)} className="text-[12px] text-muted-foreground hover:text-foreground">
              Scan again
            </button>
            <button disabled={!picked.size || busy} onClick={importPicked} className={primary}>
              {busy && <Loader2 className="size-4 animate-spin" />} Add {picked.size} {picked.size === 1 ? "lead" : "leads"}
            </button>
          </div>
        </>
      )}
    </Shell>
  );
}

const splitList = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function ProfileDialog({ store, open, onClose }: { store: LeadsStore; open: boolean; onClose: () => void }) {
  const p = store.data?.profile;
  const [form, setForm] = React.useState({ offer: "", idealCustomer: "", industries: "", regions: "", roles: "", excludedDomains: "" });
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setForm({
      offer: p?.offer ?? "",
      idealCustomer: p?.idealCustomer ?? "",
      industries: p?.industries.join(", ") ?? "",
      regions: p?.regions.join(", ") ?? "",
      roles: p?.roles.join(", ") ?? "",
      excludedDomains: p?.excludedDomains.join(", ") ?? "",
    });
  }, [open, p]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function save() {
    setBusy(true);
    try {
      await store.saveProfile({
        offer: form.offer,
        idealCustomer: form.idealCustomer,
        industries: splitList(form.industries).slice(0, 20),
        regions: splitList(form.regions).slice(0, 20),
        roles: splitList(form.roles).slice(0, 20),
        excludedDomains: splitList(form.excludedDomains).slice(0, 100),
      });
      toast.success("Ideal customer saved");
      onClose();
    } catch {
      toast.error("Couldn't save. Check the fields.");
    } finally {
      setBusy(false);
    }
  }
  const label = "block space-y-1 text-[13px] font-medium";
  return (
    <Shell open={open} onClose={onClose} title="Ideal customer" desc="AI scores every lead against this and writes down why. Be specific.">
      <label className={label}>
        What do you sell?
        <textarea value={form.offer} onChange={set("offer")} rows={3} maxLength={2000} placeholder="e.g. Outsourced HR and payroll compliance for growing companies" className={field} />
      </label>
      <label className={label}>
        Who buys it?
        <textarea value={form.idealCustomer} onChange={set("idealCustomer")} rows={3} maxLength={2000} placeholder="e.g. 20–500 staff, no in-house HR team, expanding into new states" className={field} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Industries
          <input value={form.industries} onChange={set("industries")} placeholder="Healthcare, Construction" className={field} />
        </label>
        <label className={label}>
          Regions
          <input value={form.regions} onChange={set("regions")} placeholder="US, Ghana" className={field} />
        </label>
        <label className={label}>
          Buyer roles
          <input value={form.roles} onChange={set("roles")} placeholder="COO, Head of People" className={field} />
        </label>
        <label className={label}>
          Never suggest these domains
          <input value={form.excludedDomains} onChange={set("excludedDomains")} placeholder="partner.com, myaccountant.com" className={field} />
        </label>
      </div>
      <div className="flex justify-end">
        <button disabled={busy} onClick={save} className={primary}>
          {busy && <Loader2 className="size-4 animate-spin" />} Save
        </button>
      </div>
    </Shell>
  );
}

const blankForm = { title: "Work with us", intro: "", thankYou: "", askCompany: true, askPhone: false, askMessage: true, active: true };

export function FormsDialog({ store, open, onClose }: { store: LeadsStore; open: boolean; onClose: () => void }) {
  const forms = store.data?.forms ?? [];
  const [editing, setEditing] = React.useState<(typeof blankForm & { id?: string }) | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = (f: LeadForm) => `${origin}/lead-form/${f.id}`;

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      await store.saveForm({ ...editing, intro: editing.intro || null, thankYou: editing.thankYou || null });
      setEditing(null);
      toast.success("Form saved");
    } catch {
      /* toast shown */
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text).catch(() => null);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <Shell open={open} onClose={() => (setEditing(null), onClose())} title="Enquiry forms" desc="Share a link or embed it on your site. Submissions need consent, are spam-protected and keep their campaign (UTM) source.">
      {editing ? (
        <div className="space-y-3">
          <label className="block space-y-1 text-[13px] font-medium">
            Title
            <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} maxLength={120} className={field} />
          </label>
          <label className="block space-y-1 text-[13px] font-medium">
            Intro
            <textarea value={editing.intro} onChange={(e) => setEditing({ ...editing, intro: e.target.value })} rows={2} maxLength={1000} placeholder="Tell us a little about what you need." className={field} />
          </label>
          <label className="block space-y-1 text-[13px] font-medium">
            Thank-you message
            <input value={editing.thankYou} onChange={(e) => setEditing({ ...editing, thankYou: e.target.value })} maxLength={300} placeholder="We'll reply within one working day." className={field} />
          </label>
          <div className="flex flex-wrap gap-4 text-[13px]">
            {(
              [
                ["askCompany", "Ask for company"],
                ["askPhone", "Ask for phone"],
                ["askMessage", "Ask for a message"],
                ["active", "Accepting responses"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={editing[k]} onChange={(e) => setEditing({ ...editing, [k]: e.target.checked })} className="size-4 accent-foreground" />
                {l}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className={ghost}>
              Cancel
            </button>
            <button disabled={busy || !editing.title.trim()} onClick={save} className={primary}>
              {busy && <Loader2 className="size-4 animate-spin" />} Save form
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {forms.map((f) => (
            <div key={f.id} className="rounded-2xl p-3.5 ring-1 ring-border">
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", f.active ? "bg-emerald-500" : "bg-neutral-400")} />
                <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{f.title}</p>
                <span className="text-[11px] text-muted-foreground">
                  {f.submissions} {f.submissions === 1 ? "submission" : "submissions"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button onClick={() => copy(url(f), `l${f.id}`)} className={cn(ghost, "px-2 py-1 text-[12px]")}>
                  {copied === `l${f.id}` ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copy link
                </button>
                <button
                  onClick={() => copy(`<iframe src="${url(f)}" style="width:100%;max-width:480px;height:640px;border:0" title="${f.title.replace(/"/g, "")}"></iframe>`, `e${f.id}`)}
                  className={cn(ghost, "px-2 py-1 text-[12px]")}
                >
                  {copied === `e${f.id}` ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copy embed
                </button>
                <a href={url(f)} target="_blank" rel="noreferrer" className={cn(ghost, "px-2 py-1 text-[12px]")}>
                  Open
                </a>
                <button onClick={() => setEditing({ id: f.id, title: f.title, intro: f.intro ?? "", thankYou: f.thankYou ?? "", askCompany: f.askCompany, askPhone: f.askPhone, askMessage: f.askMessage, active: f.active })} className={cn(ghost, "px-2 py-1 text-[12px]")}>
                  Edit
                </button>
                <button
                  onClick={() => confirm(`Delete “${f.title}”? Leads it collected stay.`) && store.deleteForm(f.id)}
                  className={cn(ghost, "px-2 py-1 text-[12px] text-rose-600")}
                  aria-label="Delete form"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
          <button onClick={() => setEditing({ ...blankForm })} className={cn(primary, "w-full")}>
            <Plus className="size-4" /> New form
          </button>
          <p className="text-[11px] text-muted-foreground">Tip: add ?utm_source=linkedin&amp;utm_campaign=spring to the link and each lead remembers where it came from.</p>
        </div>
      )}
    </Shell>
  );
}

export function AddLeadDialog({ store, open, onClose, onCreated }: { store: LeadsStore; open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const blank = { name: "", email: "", company: "", title: "", phone: "", notes: "" };
  const [f, setF] = React.useState(blank);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (open) setF(blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const lead = await store.create({ name: f.name || null, email: f.email || null, company: f.company || null, title: f.title || null, phone: f.phone || null, notes: f.notes || null });
    setBusy(false);
    if (lead) {
      onClose();
      onCreated(lead.id);
    }
  }
  return (
    <Shell open={open} onClose={onClose} title="Add a lead" desc="Someone you met, were referred to or want to win.">
      <form onSubmit={save} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={f.name} onChange={set("name")} placeholder="Name" maxLength={160} className={field} autoFocus />
          <input value={f.email} onChange={set("email")} placeholder="Email" type="email" maxLength={254} className={field} />
          <input value={f.company} onChange={set("company")} placeholder="Company" maxLength={160} className={field} />
          <input value={f.title} onChange={set("title")} placeholder="Job title" maxLength={160} className={field} />
          <input value={f.phone} onChange={set("phone")} placeholder="Phone" maxLength={60} className={field} />
        </div>
        <textarea value={f.notes} onChange={set("notes")} rows={3} placeholder="Notes" maxLength={5000} className={field} />
        <div className="flex justify-end">
          <button disabled={busy || (!f.name.trim() && !f.email.trim())} className={primary}>
            {busy && <Loader2 className="size-4 animate-spin" />} Add lead
          </button>
        </div>
      </form>
    </Shell>
  );
}
