"use client";
import { toast } from "sonner";
import { api, type RouterInputs, type RouterOutputs } from "@/trpc/react";

export type Overview = RouterOutputs["leads"]["overview"];
export type Lead = Overview["leads"][number];
export type LeadDetail = RouterOutputs["leads"]["get"];
export type LeadForm = Overview["forms"][number];
export type Profile = NonNullable<Overview["profile"]>;
export type Candidate = RouterOutputs["leads"]["scanInbox"][number] & { phone?: string | null };
export type Stage = Lead["stage"];
export type ProfileInput = RouterInputs["leads"]["saveProfile"];
export type FormInput = RouterInputs["leads"]["saveForm"];
export type CreateInput = RouterInputs["leads"]["create"];
export type UpdateInput = RouterInputs["leads"]["update"];
export type CandidateInput = RouterInputs["leads"]["importCandidates"]["candidates"][number];
export type DraftResult = RouterOutputs["leads"]["draftOutreach"];

/** Everything the leads screens need: the live tRPC store, or an in-memory one for previews. */
export type LeadsStore = {
  data: Overview | undefined;
  loading: boolean;
  updatedAt: number;
  refreshing: boolean;
  useLead: (id: string | null) => LeadDetail | undefined;
  create: (input: CreateInput) => Promise<Lead | undefined>;
  update: (input: UpdateInput) => void;
  remove: (ids: string[]) => void;
  saveProfile: (input: ProfileInput) => Promise<void>;
  scanInbox: () => Promise<Candidate[]>;
  procurementContacts: () => Promise<Candidate[]>;
  importCandidates: (c: CandidateInput[]) => Promise<{ created: number; skipped: number }>;
  importCsv: (csv: string) => Promise<{ created: number; skipped: number }>;
  qualify: (ids: string[]) => Promise<{ id: string; ok: boolean; error?: string }[]>;
  draftOutreach: (input: { id: string; accountId: string; instructions?: string }) => Promise<DraftResult>;
  addFollowUp: (lead: Lead, dueDate: string) => Promise<void>;
  saveForm: (input: FormInput) => Promise<void>;
  deleteForm: (id: string) => void;
};

export const STAGES: { id: Stage; label: string; tone: string; dot: string }[] = [
  { id: "new", label: "New", tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", dot: "bg-sky-500" },
  { id: "researching", label: "Researching", tone: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", dot: "bg-violet-500" },
  { id: "contacted", label: "Contacted", tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", dot: "bg-amber-500" },
  { id: "replied", label: "Replied", tone: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300", dot: "bg-teal-500" },
  { id: "meeting", label: "Meeting", tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300", dot: "bg-indigo-500" },
  { id: "proposal", label: "Proposal", tone: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300", dot: "bg-orange-500" },
  { id: "won", label: "Won", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", dot: "bg-emerald-500" },
  { id: "lost", label: "Lost", tone: "bg-neutral-200 text-neutral-600 dark:bg-neutral-500/15 dark:text-neutral-300", dot: "bg-neutral-400" },
  { id: "not_a_fit", label: "Not a fit", tone: "bg-neutral-200 text-neutral-600 dark:bg-neutral-500/15 dark:text-neutral-300", dot: "bg-neutral-400" },
];
export const stageInfo = (s: Stage) => STAGES.find((x) => x.id === s)!;
export const OPEN_STAGES: Stage[] = ["new", "researching", "contacted", "replied", "meeting", "proposal"];

export const SOURCES: Record<Lead["source"], string> = { inbox: "Mailbox", procurement: "Tender", form: "Form", manual: "Added", import: "Import" };

export function useTrpcLeadsStore(): LeadsStore {
  const utils = api.useUtils();
  const q = api.leads.overview.useQuery(undefined, { staleTime: 15_000, refetchOnWindowFocus: true, refetchInterval: 30_000, refetchIntervalInBackground: false });
  const onError = (e: { message: string }) => toast.error(e.message);
  const invalidate = () => Promise.all([utils.leads.overview.invalidate(), utils.leads.get.invalidate()]);
  const patch = (fn: (l: Lead[]) => Lead[]) => utils.leads.overview.setData(undefined, (old) => (old ? { ...old, leads: fn(old.leads) } : old));

  const createM = api.leads.create.useMutation({ onError });
  const updateM = api.leads.update.useMutation({ onError: (e) => (onError(e), void invalidate()), onSuccess: () => void invalidate() });
  const removeM = api.leads.remove.useMutation({ onError, onSettled: () => void invalidate() });
  const profileM = api.leads.saveProfile.useMutation({ onError });
  const scanM = api.leads.scanInbox.useMutation({ onError });
  const procM = api.leads.procurementContacts.useMutation({ onError });
  const importM = api.leads.importCandidates.useMutation({ onError });
  const csvM = api.leads.importCsv.useMutation({ onError });
  const qualifyM = api.leads.qualify.useMutation({ onError });
  const draftM = api.leads.draftOutreach.useMutation({ onError });
  const formM = api.leads.saveForm.useMutation({ onError });
  const delFormM = api.leads.deleteForm.useMutation({ onError, onSettled: () => void invalidate() });
  const taskM = api.tasks.create.useMutation({ onError });

  return {
    data: q.data,
    loading: q.isLoading,
    updatedAt: q.dataUpdatedAt,
    refreshing: q.isFetching,
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useLead: (id) => api.leads.get.useQuery({ id: id ?? "" }, { enabled: !!id }).data,
    create: async (input) => {
      const l = await createM.mutateAsync(input).catch(() => undefined);
      await invalidate();
      return l;
    },
    update: (input) => {
      patch((ls) => ls.map((l) => (l.id === input.id ? ({ ...l, ...input } as Lead) : l)));
      updateM.mutate(input);
    },
    remove: (ids) => {
      patch((ls) => ls.filter((l) => !ids.includes(l.id)));
      removeM.mutate({ ids });
    },
    saveProfile: async (input) => {
      await profileM.mutateAsync(input);
      await invalidate();
    },
    scanInbox: () => scanM.mutateAsync(),
    procurementContacts: () => procM.mutateAsync(),
    importCandidates: async (candidates) => {
      const r = await importM.mutateAsync({ candidates });
      await invalidate();
      return r;
    },
    importCsv: async (csv) => {
      const r = await csvM.mutateAsync({ csv });
      await invalidate();
      return r;
    },
    qualify: async (ids) => {
      const r = await qualifyM.mutateAsync({ ids }).catch(() => []);
      await invalidate();
      return r;
    },
    draftOutreach: async (input) => {
      const r = await draftM.mutateAsync(input);
      await invalidate();
      return r;
    },
    addFollowUp: async (lead, dueDate) => {
      await taskM.mutateAsync({
        title: `Follow up with ${lead.name ?? lead.email ?? "lead"}${lead.company ? ` (${lead.company})` : ""}`,
        description: [lead.nextStep, lead.email].filter(Boolean).join("\n"),
        dueDate,
        priority: lead.fit === "strong" ? "high" : "medium",
        labels: ["lead"],
        projectName: "Leads",
      });
      toast.success("Follow-up added to Tasks");
    },
    saveForm: async (input) => {
      await formM.mutateAsync(input);
      await invalidate();
    },
    deleteForm: (id) => delFormM.mutate({ id }),
  };
}
