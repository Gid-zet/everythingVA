"use client";
import React from "react";
import { CheckCircle2, Loader2, RefreshCw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import { Field, PageHeader, Section, formatDate, inputClass } from "../components/bits";

export default function SettingsPage() {
  const utils = api.useUtils();
  const { data: overview } = api.procurement.overview.useQuery();
  const { data: runs } = api.procurement.discoveryRuns.useQuery();
  const run = api.procurement.runDiscovery.useMutation({
    onSuccess: (r) => {
      for (const x of r) x.error ? toast.error(x.error) : toast.success(`${x.source === "sam_gov" ? "SAM.gov" : "CanadaBuys"}: ${x.created} new, ${x.updated} updated`);
      void utils.procurement.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const editor = overview && overview.workspace.role !== "viewer";

  const sources = [
    {
      id: "sam_gov" as const,
      name: "SAM.gov (US federal)",
      on: !!overview?.sources.samGov,
      detail: overview?.sources.samGov
        ? "Searched daily by each NAICS code in the profile (one API request per code)."
        : "Off. Set SAM_GOV_API_KEY (free, from your SAM.gov account) in the deployment environment. Without a SAM.gov role the key allows 10 requests a day.",
    },
    {
      id: "canadabuys" as const,
      name: "CanadaBuys (Canadian federal)",
      on: true,
      detail: "Open tender notices from the public CanadaBuys data feed, matched against your keywords and UNSPSC codes. No key needed.",
    },
  ];

  return (
    <>
      <PageHeader title="Sources & team" description="Where opportunities come from, how discovery runs, and who can do what." />

      <Section title="Opportunity sources" description="Discovery runs daily at 11:00 UTC (Vercel Cron). You can also run it now.">
        <ul className="-my-2 divide-y">
          {sources.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              {s.on ? <CheckCircle2 className="size-4 shrink-0 text-emerald-500" /> : <XCircle className="size-4 shrink-0 text-muted-foreground" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.detail}</p>
              </div>
              {editor && s.on && (
                <Button size="sm" variant="outline" disabled={run.isPending || !overview?.hasProfile} onClick={() => run.mutate({ source: s.id })}>
                  {run.isPending && run.variables?.source === s.id ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 size-3.5" />}
                  Run now
                </Button>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] text-muted-foreground">
          State, provincial, municipal, university and corporate portals, and supplier registration discovery, come in a later phase.
        </p>
      </Section>

      <Section title="Discovery history" className="mt-6">
        {runs?.length ? (
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-5 py-2 font-medium">Started</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Trigger</th>
                  <th className="px-3 py-2 text-right font-medium">Scanned</th>
                  <th className="px-3 py-2 text-right font-medium">New</th>
                  <th className="px-5 py-2 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-5 py-2">{formatDate(r.startedAt, true)}</td>
                    <td className="px-3 py-2">{r.source === "sam_gov" ? "SAM.gov" : "CanadaBuys"}</td>
                    <td className="px-3 py-2 capitalize">{r.trigger}</td>
                    {r.error ? (
                      <td colSpan={3} className="px-5 py-2 text-right text-xs text-rose-600 dark:text-rose-400">
                        {r.error}
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums">{r.scanned.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.created}</td>
                        <td className="px-5 py-2 text-right tabular-nums">{r.updated}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        )}
      </Section>

      <Team />
    </>
  );
}

const ROLE_HELP = {
  owner: "Everything, including team roles",
  admin: "Verify credentials and documents, approve or decline bids, mark submissions, manage the team",
  editor: "Run discovery and agents, edit opportunities, tasks and documents",
  viewer: "Read only",
};

function Team() {
  const utils = api.useUtils();
  const { data } = api.procurement.members.useQuery();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "editor" | "viewer">("editor");
  const refresh = () => void utils.procurement.members.invalidate();
  const add = api.procurement.addMember.useMutation({
    onSuccess: () => {
      setEmail("");
      refresh();
      toast.success("Added to the team");
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = api.procurement.removeMember.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const canManage = data?.myRole === "owner" || data?.myRole === "admin";

  return (
    <Section title="Team and roles" className="mt-6">
      <ul className="-my-2 mb-4 divide-y">
        {data?.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {[m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.emailAddress}
                {m.userId === data.me && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
              </p>
              <p className="text-xs text-muted-foreground">{m.user.emailAddress}</p>
            </div>
            <span className="text-xs capitalize" title={ROLE_HELP[m.role]}>
              {m.role}
            </span>
            {canManage && m.role !== "owner" && m.userId !== data.me && (
              <Button size="icon" variant="ghost" className="size-8" aria-label="Remove" onClick={() => remove.mutate({ userId: m.userId })}>
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <form
          className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate({ email, role });
          }}
        >
          <Field label="Add someone by email" hint="They need to have signed in to everythingVA once." className="flex-1">
            <input type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Role" className="sm:w-36">
            <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </Field>
          <Button type="submit" disabled={add.isPending}>
            Add
          </Button>
        </form>
      )}
      <dl className="mt-4 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
        {Object.entries(ROLE_HELP).map(([r, h]) => (
          <div key={r}>
            <dt className="inline font-medium capitalize text-foreground">{r}:</dt> <dd className="inline">{h}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
