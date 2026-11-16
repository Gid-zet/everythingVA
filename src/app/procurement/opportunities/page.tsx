"use client";
import React, { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, type RouterInputs } from "@/trpc/react";
import { ELIGIBILITY_LABELS, SOURCE_LABELS, STATUS_LABELS } from "@/server/procurement/types";
import {
  EligibilityBadge,
  EmptyState,
  Field,
  FitScore,
  PageHeader,
  RecommendationBadge,
  StatusBadge,
  formatDate,
  inputClass,
  relativeDays,
} from "../components/bits";

type Filters = RouterInputs["procurement"]["opportunities"];

function OpportunitiesInner() {
  const params = useSearchParams();
  const router = useRouter();
  const utils = api.useUtils();
  const [search, setSearch] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const filters: Filters = {
    status: (params.get("status") as Filters["status"]) ?? "active",
    eligibility: (params.get("eligibility") as Filters["eligibility"]) ?? "all",
    source: (params.get("source") as Filters["source"]) ?? "all",
    sort: (params.get("sort") as Filters["sort"]) ?? "relevance",
    search: params.get("q") ?? undefined,
  };
  const setParam = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    router.replace(`/procurement/opportunities${next.size ? `?${next}` : ""}`);
  };

  const { data: overview } = api.procurement.overview.useQuery();
  const { data, isLoading } = api.procurement.opportunities.useQuery(filters);
  const qualify = api.procurement.qualify.useMutation({
    onSuccess: () => void utils.procurement.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const discover = api.procurement.runDiscovery.useMutation({
    onSuccess: (results) => {
      for (const r of results.filter((r) => r.error)) toast.error(`${SOURCE_LABELS[r.source]}: ${r.error}`);
      const created = results.reduce((n, r) => n + r.created, 0);
      toast.success(`${created} new ${created === 1 ? "opportunity" : "opportunities"} found.`);
      void utils.procurement.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [batch, setBatch] = React.useState<{ done: number; total: number } | null>(null);
  const unscored = (data ?? []).filter((o) => o.fitScore === null).slice(0, 10);
  const qualifyBatch = async () => {
    setBatch({ done: 0, total: unscored.length });
    for (const [i, o] of unscored.entries()) {
      await qualify.mutateAsync({ id: o.id }).catch(() => undefined);
      setBatch({ done: i + 1, total: unscored.length });
    }
    setBatch(null);
  };

  const editor = overview && overview.workspace.role !== "viewer";

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Found on SAM.gov and CanadaBuys or added by hand, ranked by keyword relevance until the qualification agent scores them."
        actions={
          editor && (
            <>
              <Button variant="outline" onClick={() => setAdding(true)}>
                <Plus className="mr-2 size-4" /> Add manually
              </Button>
              {overview?.aiConfigured && unscored.length > 0 && (
                <Button variant="outline" onClick={qualifyBatch} disabled={!!batch}>
                  {batch ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  {batch ? `Qualifying ${batch.done}/${batch.total}…` : `Qualify top ${unscored.length}`}
                </Button>
              )}
              <Button onClick={() => discover.mutate()} disabled={discover.isPending || !overview?.hasProfile}>
                {discover.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
                {discover.isPending ? "Searching…" : "Find now"}
              </Button>
            </>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <form
          className="relative min-w-56 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setParam("q", search.trim(), "");
          }}
        >
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <input className={`${inputClass} pl-8`} placeholder="Search title, issuer or reference" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <select className={`${inputClass} w-auto`} value={filters.status} onChange={(e) => setParam("status", e.target.value, "active")} aria-label="Status">
          <option value="active">Active pipeline</option>
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className={`${inputClass} w-auto`} value={filters.eligibility} onChange={(e) => setParam("eligibility", e.target.value, "all")} aria-label="Eligibility">
          <option value="all">Any eligibility</option>
          <option value="eligible">Qualified or potentially qualified</option>
          <option value="unscored">Not assessed yet</option>
          {Object.entries(ELIGIBILITY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className={`${inputClass} w-auto`} value={filters.source} onChange={(e) => setParam("source", e.target.value, "all")} aria-label="Source">
          <option value="all">All sources</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className={`${inputClass} w-auto`} value={filters.sort} onChange={(e) => setParam("sort", e.target.value, "relevance")} aria-label="Sort">
          <option value="relevance">Most relevant</option>
          <option value="fit">Best fit</option>
          <option value="deadline">Closing soonest</option>
          <option value="newest">Newest</option>
        </select>
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />
      ) : !data?.length ? (
        <EmptyState title="No opportunities match">
          {overview?.hasProfile ? "Try other filters, or press “Find now” to search the sources." : "Set up the company profile first, then run discovery."}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <ul className="divide-y">
            {data.map((o) => (
              <li key={o.id}>
                <Link href={`/procurement/opportunities/${o.id}`} className="flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">{o.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {SOURCE_LABELS[o.source]} · {o.organization ?? "Unknown issuer"}
                      {o.referenceNumber ? ` · ${o.referenceNumber}` : ""}
                      {o.setAside ? ` · ${o.setAside}` : ""}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={o.status} />
                      <EligibilityBadge value={o.eligibility} />
                      <RecommendationBadge value={o.recommendation} />
                      {o.amendedAt && <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Amended {formatDate(o.amendedAt)}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-5 text-right sm:w-56 sm:justify-end">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Closes</p>
                      <p className="text-xs font-medium">{o.deadline ? `${formatDate(o.deadline)} · ${relativeDays(o.deadline)}` : "Not stated"}</p>
                    </div>
                    <div className="w-10">
                      <p className="text-[11px] text-muted-foreground">Fit</p>
                      {o.fitScore !== null ? <FitScore score={o.fitScore} /> : <p className="text-xs text-muted-foreground" title="Keyword relevance">~{o.relevance}</p>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AddOpportunityDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}

function AddOpportunityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [form, setForm] = React.useState({ title: "", organization: "", sourceUrl: "", referenceNumber: "", deadline: "", description: "" });
  const create = api.procurement.createOpportunity.useMutation({
    onSuccess: (o) => {
      onOpenChange(false);
      router.push(`/procurement/opportunities/${o.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add an opportunity</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({
              title: form.title,
              organization: form.organization || undefined,
              sourceUrl: form.sourceUrl,
              referenceNumber: form.referenceNumber || undefined,
              deadline: form.deadline ? new Date(form.deadline) : null,
              description: form.description || undefined,
            });
          }}
        >
          <Field label="Title">
            <input required className={inputClass} value={form.title} onChange={set("title")} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Issuing organization">
              <input className={inputClass} value={form.organization} onChange={set("organization")} />
            </Field>
            <Field label="Reference number">
              <input className={inputClass} value={form.referenceNumber} onChange={set("referenceNumber")} />
            </Field>
          </div>
          <Field label="Link to the notice">
            <input required type="url" className={inputClass} placeholder="https://" value={form.sourceUrl} onChange={set("sourceUrl")} />
          </Field>
          <Field label="Deadline">
            <input type="datetime-local" className={inputClass} value={form.deadline} onChange={set("deadline")} />
          </Field>
          <Field label="Description" hint="Paste the scope or summary; the qualification agent reads it.">
            <textarea rows={5} className={`${inputClass} h-auto py-2`} value={form.description} onChange={set("description")} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<Loader2 className="mx-auto mt-20 size-5 animate-spin text-muted-foreground" />}>
      <OpportunitiesInner />
    </Suspense>
  );
}
