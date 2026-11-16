"use client";
import React from "react";
import { Loader2, Pencil, Plus, ShieldCheck, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, type RouterOutputs } from "@/trpc/react";
import { ChipsInput, EmptyState, Field, PageHeader, Section, VerificationBadge, formatDate, inputClass } from "../components/bits";

type Profile = NonNullable<RouterOutputs["procurement"]["profile"]>;
type Credential = RouterOutputs["procurement"]["credentials"][number];

const EMPTY = {
  legalName: "",
  website: "",
  summary: "",
  services: [] as string[],
  keywords: [] as string[],
  excludedKeywords: [] as string[],
  naicsCodes: [] as string[],
  unspscCodes: [] as string[],
  businessTypes: [] as string[],
  countries: [] as string[],
  serviceRegions: [] as string[],
  yearsInBusiness: "" as string,
  governmentExperience: "",
};

const fromProfile = (p: Profile | null | undefined) =>
  p
    ? {
        legalName: p.legalName,
        website: p.website ?? "",
        summary: p.summary,
        services: p.services,
        keywords: p.keywords,
        excludedKeywords: p.excludedKeywords,
        naicsCodes: p.naicsCodes,
        unspscCodes: p.unspscCodes,
        businessTypes: p.businessTypes,
        countries: p.countries,
        serviceRegions: p.serviceRegions,
        yearsInBusiness: p.yearsInBusiness?.toString() ?? "",
        governmentExperience: p.governmentExperience ?? "",
      }
    : EMPTY;

export default function ProfilePage() {
  const utils = api.useUtils();
  const { data: overview } = api.procurement.overview.useQuery();
  const { data: profile, isLoading } = api.procurement.profile.useQuery();
  const [form, setForm] = React.useState(EMPTY);
  React.useEffect(() => setForm(fromProfile(profile)), [profile]);

  const isAdmin = overview?.workspace.role === "owner" || overview?.workspace.role === "admin";
  const save = api.procurement.saveProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile saved");
      void utils.procurement.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const template = api.procurement.applyCcmTemplate.useMutation({
    onSuccess: (r) => {
      toast.success(`Profile filled from the CCM brief. ${r.added} credentials added as unverified.`);
      void utils.procurement.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <Loader2 className="mx-auto mt-20 size-5 animate-spin text-muted-foreground" />;

  const set = <K extends keyof typeof form>(k: K) => (v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <PageHeader
        title="Company profile"
        description="What the agents know about your business. Keep it accurate: discovery searches with it, and qualification only counts verified credentials."
        actions={
          isAdmin && (
            <Button variant="outline" onClick={() => template.mutate()} disabled={template.isPending}>
              {template.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Wand2 className="mr-2 size-4" />}
              {profile ? "Refill from CCM brief" : "Start from the CCM brief"}
            </Button>
          )
        }
      />
      {!isAdmin && <p className="mb-4 text-sm text-muted-foreground">Only an admin or owner can edit the profile.</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({
            ...form,
            website: form.website || null,
            yearsInBusiness: form.yearsInBusiness ? Number(form.yearsInBusiness) : null,
            governmentExperience: form.governmentExperience || null,
          });
        }}
      >
        <fieldset disabled={!isAdmin} className="space-y-6">
          <Section title="Business">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Legal name">
                <input required className={inputClass} value={form.legalName} onChange={(e) => set("legalName")(e.target.value)} />
              </Field>
              <Field label="Website">
                <input className={inputClass} value={form.website} onChange={(e) => set("website")(e.target.value)} placeholder="https://" />
              </Field>
              <Field label="Summary" className="sm:col-span-2" hint="One paragraph, as you'd describe the company to a buyer.">
                <textarea rows={3} className={`${inputClass} h-auto py-2`} value={form.summary} onChange={(e) => set("summary")(e.target.value)} />
              </Field>
              <Field label="Business types" hint="As claimed. Prove them with verified credentials below." className="sm:col-span-2">
                <ChipsInput value={form.businessTypes} onChange={set("businessTypes")} placeholder="e.g. Woman-owned small business" disabled={!isAdmin} />
              </Field>
              <Field label="Years in business">
                <input type="number" min={0} className={inputClass} value={form.yearsInBusiness} onChange={(e) => set("yearsInBusiness")(e.target.value)} />
              </Field>
              <Field label="Countries you can work in" hint="ISO codes, e.g. US, CA">
                <ChipsInput value={form.countries} onChange={set("countries")} placeholder="US, CA" disabled={!isAdmin} />
              </Field>
              <Field label="Service regions" className="sm:col-span-2" hint="States, provinces or cities you serve on site. Leave empty if anywhere.">
                <ChipsInput value={form.serviceRegions} onChange={set("serviceRegions")} placeholder="e.g. Maryland, Ontario" disabled={!isAdmin} />
              </Field>
              <Field label="Government contracting experience" className="sm:col-span-2" hint="Only real, verifiable work. The agents won't invent past performance.">
                <textarea rows={3} className={`${inputClass} h-auto py-2`} value={form.governmentExperience} onChange={(e) => set("governmentExperience")(e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="What to search for" description="Discovery ranks notices by these phrases and codes.">
            <div className="grid gap-4">
              <Field label="Services">
                <ChipsInput value={form.services} onChange={set("services")} placeholder="Leadership development" disabled={!isAdmin} />
              </Field>
              <Field label="Search keywords" hint="Phrases buyers use in notices. Whole phrases are matched.">
                <ChipsInput value={form.keywords} onChange={set("keywords")} placeholder="executive coaching" disabled={!isAdmin} />
              </Field>
              <Field label="Exclude notices whose title contains">
                <ChipsInput value={form.excludedKeywords} onChange={set("excludedKeywords")} placeholder="construction" disabled={!isAdmin} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="NAICS codes" hint="SAM.gov is searched by these (one request each).">
                  <ChipsInput value={form.naicsCodes} onChange={set("naicsCodes")} placeholder="611430" disabled={!isAdmin} />
                </Field>
                <Field label="UNSPSC codes" hint="Used to match CanadaBuys notices, by prefix.">
                  <ChipsInput value={form.unspscCodes} onChange={set("unspscCodes")} placeholder="80111500" disabled={!isAdmin} />
                </Field>
              </div>
            </div>
          </Section>

          {isAdmin && (
            <div className="flex justify-end">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Save profile
              </Button>
            </div>
          )}
        </fieldset>
      </form>

      <Credentials role={overview?.workspace.role} />
    </>
  );
}

function Credentials({ role }: { role?: string }) {
  const utils = api.useUtils();
  const { data } = api.procurement.credentials.useQuery();
  const [editing, setEditing] = React.useState<Credential | "new" | null>(null);
  const isAdmin = role === "owner" || role === "admin";
  const isEditor = !!role && role !== "viewer";
  const refresh = () => void utils.procurement.invalidate();
  const verify = api.procurement.verifyCredential.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const remove = api.procurement.deleteCredential.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });

  return (
    <Section
      className="mt-6"
      title="Certifications, registrations and insurance"
      description="Agents treat a credential as held only when it is verified and unexpired."
      actions={
        isEditor && (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus className="mr-1.5 size-3.5" /> Add
          </Button>
        )
      }
    >
      {!data?.length ? (
        <EmptyState title="No credentials yet">Add WOSB, WBENC, SAM.gov registration, insurance and similar.</EmptyState>
      ) : (
        <ul className="-my-2 divide-y">
          {data.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{c.name}</p>
                  <VerificationBadge status={c.status} />
                  {c.expiresAt && new Date(c.expiresAt) < new Date() && <span className="text-[11px] font-medium text-rose-600">Expired</span>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[c.issuer, c.identifier && `No. ${c.identifier}`, c.expiresAt && `Expires ${formatDate(c.expiresAt)}`, c.document && `Evidence: ${c.document.name}`]
                    .filter(Boolean)
                    .join(" · ") || c.kind.replace("_", " ")}
                  {c.verifiedAt && ` · ${c.status} ${formatDate(c.verifiedAt)}`}
                </p>
              </div>
              <div className="flex gap-1.5">
                {isAdmin && c.status !== "verified" && (
                  <Button size="sm" variant="outline" onClick={() => verify.mutate({ id: c.id, status: "verified" })} disabled={verify.isPending}>
                    <ShieldCheck className="mr-1.5 size-3.5" /> Verify
                  </Button>
                )}
                {isAdmin && c.status === "verified" && (
                  <Button size="sm" variant="ghost" onClick={() => verify.mutate({ id: c.id, status: "unverified" })}>
                    Unverify
                  </Button>
                )}
                {isEditor && (
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditing(c)} aria-label="Edit">
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label="Delete"
                    onClick={() => confirm(`Delete ${c.name}?`) && remove.mutate({ id: c.id })}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {isAdmin && <p className="mt-4 text-[11px] text-muted-foreground">Verify only after checking the certificate or registration itself. Each verification is recorded in the activity log.</p>}
      {editing && <CredentialDialog credential={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Section>
  );
}

const toDateInput = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

function CredentialDialog({ credential, onClose }: { credential: Credential | null; onClose: () => void }) {
  const utils = api.useUtils();
  const { data: docs } = api.procurement.documents.useQuery();
  const [f, setF] = React.useState({
    name: credential?.name ?? "",
    kind: credential?.kind ?? "certification",
    issuer: credential?.issuer ?? "",
    identifier: credential?.identifier ?? "",
    issuedAt: toDateInput(credential?.issuedAt),
    expiresAt: toDateInput(credential?.expiresAt),
    notes: credential?.notes ?? "",
    documentId: credential?.documentId ?? "",
  });
  const save = api.procurement.saveCredential.useMutation({
    onSuccess: () => {
      void utils.procurement.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{credential ? "Edit credential" : "Add a credential"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              id: credential?.id,
              name: f.name,
              kind: f.kind as Credential["kind"],
              issuer: f.issuer || null,
              identifier: f.identifier || null,
              issuedAt: f.issuedAt ? new Date(f.issuedAt) : null,
              expiresAt: f.expiresAt ? new Date(f.expiresAt) : null,
              notes: f.notes || null,
              documentId: f.documentId || null,
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2">
              <input required className={inputClass} value={f.name} onChange={set("name")} placeholder="WBENC Women's Business Enterprise" />
            </Field>
            <Field label="Type">
              <select className={inputClass} value={f.kind} onChange={set("kind")}>
                <option value="certification">Certification</option>
                <option value="registration">Registration</option>
                <option value="insurance">Insurance</option>
                <option value="contract_vehicle">Contract vehicle</option>
                <option value="license">License</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Issuer">
              <input className={inputClass} value={f.issuer} onChange={set("issuer")} />
            </Field>
            <Field label="Certificate / registration number" className="sm:col-span-2">
              <input className={inputClass} value={f.identifier} onChange={set("identifier")} />
            </Field>
            <Field label="Issued">
              <input type="date" className={inputClass} value={f.issuedAt} onChange={set("issuedAt")} />
            </Field>
            <Field label="Expires">
              <input type="date" className={inputClass} value={f.expiresAt} onChange={set("expiresAt")} />
            </Field>
            <Field label="Evidence document" className="sm:col-span-2" hint="Upload it in the knowledge base first.">
              <select className={inputClass} value={f.documentId} onChange={set("documentId")}>
                <option value="">None</option>
                {docs?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea rows={2} className={`${inputClass} h-auto py-2`} value={f.notes} onChange={set("notes")} />
            </Field>
          </div>
          {credential?.status === "verified" && <p className="text-xs text-amber-700 dark:text-amber-300">Changing the name, number or expiry will need it verified again.</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
