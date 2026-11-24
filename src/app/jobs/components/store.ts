"use client";
import { toast } from "sonner";
import { api, type RouterInputs, type RouterOutputs } from "@/trpc/react";

export type Overview = RouterOutputs["jobs"]["overview"];
export type Job = Overview["jobs"][number];
export type JobDetail = RouterOutputs["jobs"]["get"];
export type JobDoc = JobDetail["documents"][number];
export type Profile = RouterOutputs["jobs"]["profile"];
export type Stage = Job["stage"];
export type CreateInput = RouterInputs["jobs"]["create"];
export type UpdateInput = RouterInputs["jobs"]["update"];
export type ProfileInput = RouterInputs["jobs"]["saveProfile"];
export type FetchResult = RouterOutputs["jobs"]["fetchPosting"];
export type DocKind = RouterInputs["jobs"]["generate"]["kind"];
export type InboxScan = RouterOutputs["jobs"]["scanInbox"];
export type Suggestion = InboxScan["suggestions"][number];
export type Discovery = Overview["discoveries"][number];
export type DiscoveryDetail = RouterOutputs["jobs"]["getDiscovery"];
export type RunResult = RouterOutputs["jobs"]["discoverNow"];

/** Everything the job screens need: the live tRPC store, or an in-memory one for previews. */
export type JobsStore = {
  data: Overview | undefined;
  loading: boolean;
  updatedAt: number;
  refreshing: boolean;
  useJob: (id: string | null) => JobDetail | undefined;
  useProfile: (enabled: boolean) => Profile | undefined;
  create: (input: CreateInput) => Promise<Job | undefined>;
  update: (input: UpdateInput) => void;
  remove: (ids: string[]) => void;
  saveProfile: (input: ProfileInput) => Promise<void>;
  fetchPosting: (url: string) => Promise<FetchResult>;
  score: (id: string) => Promise<void>;
  generate: (id: string, kind: DocKind, instructions?: string) => Promise<JobDoc | undefined>;
  saveDocument: (input: { id: string; title: string; content: string }) => Promise<void>;
  deleteDocument: (id: string) => void;
  scanInbox: () => Promise<InboxScan>;
  applySuggestion: (s: Suggestion, stage: Stage | null) => Promise<void>;
  dismissSuggestion: (s: Suggestion) => void;
  addTask: (job: Job, title: string, dueDate: string) => Promise<void>;
  useDiscovery: (id: string | null) => DiscoveryDetail | undefined;
  discoverNow: () => Promise<RunResult | undefined>;
  saveDiscovery: (id: string) => Promise<Job | undefined>;
  dismissDiscoveries: (ids: string[]) => void;
  scoreDiscovery: (id: string) => Promise<void>;
  saveDiscoverySettings: (input: { discoverEnabled: boolean; remoteOnly: boolean }) => Promise<void>;
};

export const STAGES: { id: Stage; label: string; dot: string; tone: string }[] = [
  { id: "saved", label: "Saved", dot: "bg-neutral-400", tone: "bg-neutral-200 text-neutral-700 dark:bg-neutral-500/15 dark:text-neutral-300" },
  { id: "applied", label: "Applied", dot: "bg-sky-500", tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  { id: "screening", label: "Screening", dot: "bg-violet-500", tone: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  { id: "interview", label: "Interview", dot: "bg-amber-500", tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  { id: "offer", label: "Offer", dot: "bg-emerald-500", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  { id: "accepted", label: "Accepted", dot: "bg-teal-500", tone: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" },
  { id: "rejected", label: "Rejected", dot: "bg-rose-400", tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  { id: "withdrawn", label: "Withdrawn", dot: "bg-neutral-400", tone: "bg-neutral-200 text-neutral-600 dark:bg-neutral-500/15 dark:text-neutral-300" },
];
export const stageInfo = (s: Stage) => STAGES.find((x) => x.id === s)!;
export const BOARD_STAGES: Stage[] = ["saved", "applied", "screening", "interview", "offer"];
export const CLOSED_STAGES: Stage[] = ["accepted", "rejected", "withdrawn"];

export function useTrpcJobsStore(): JobsStore {
  const utils = api.useUtils();
  const q = api.jobs.overview.useQuery(undefined, { staleTime: 15_000, refetchOnWindowFocus: true, refetchInterval: 30_000, refetchIntervalInBackground: false });
  const onError = (e: { message: string }) => toast.error(e.message);
  const invalidate = () => Promise.all([utils.jobs.overview.invalidate(), utils.jobs.get.invalidate()]);
  const patch = (fn: (j: Job[]) => Job[]) => utils.jobs.overview.setData(undefined, (old) => (old ? { ...old, jobs: fn(old.jobs) } : old));

  const createM = api.jobs.create.useMutation({ onError });
  const updateM = api.jobs.update.useMutation({ onError: (e) => (onError(e), void invalidate()), onSuccess: () => void invalidate() });
  const removeM = api.jobs.remove.useMutation({ onError, onSettled: () => void invalidate() });
  const profileM = api.jobs.saveProfile.useMutation({ onError });
  const fetchM = api.jobs.fetchPosting.useMutation({ onError });
  const scoreM = api.jobs.score.useMutation({ onError });
  const genM = api.jobs.generate.useMutation({ onError });
  const saveDocM = api.jobs.saveDocument.useMutation({ onError });
  const delDocM = api.jobs.deleteDocument.useMutation({ onError, onSettled: () => void invalidate() });
  const scanM = api.jobs.scanInbox.useMutation({ onError });
  const applyM = api.jobs.applySuggestion.useMutation({ onError });
  const dismissM = api.jobs.dismissSuggestion.useMutation({ onError });
  const taskM = api.tasks.create.useMutation({ onError });
  const discM = api.jobs.discoverNow.useMutation({ onError });
  const saveDiscM = api.jobs.saveDiscovery.useMutation({ onError });
  const dismissM2 = api.jobs.dismissDiscoveries.useMutation({ onError, onSettled: () => void invalidate() });
  const scoreDiscM = api.jobs.scoreDiscovery.useMutation({ onError });
  const discSetM = api.jobs.saveDiscoverySettings.useMutation({ onError });
  const patchDisc = (fn: (d: Overview["discoveries"]) => Overview["discoveries"]) => utils.jobs.overview.setData(undefined, (old) => (old ? { ...old, discoveries: fn(old.discoveries) } : old));

  return {
    data: q.data,
    loading: q.isLoading,
    updatedAt: q.dataUpdatedAt,
    refreshing: q.isFetching,
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useJob: (id) => api.jobs.get.useQuery({ id: id ?? "" }, { enabled: !!id }).data,
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useProfile: (enabled) => api.jobs.profile.useQuery(undefined, { enabled }).data,
    create: async (input) => {
      const j = await createM.mutateAsync(input).catch(() => undefined);
      await invalidate();
      return j;
    },
    update: (input) => {
      patch((js) => js.map((j) => (j.id === input.id ? ({ ...j, ...input } as Job) : j)));
      updateM.mutate(input);
    },
    remove: (ids) => {
      patch((js) => js.filter((j) => !ids.includes(j.id)));
      removeM.mutate({ ids });
    },
    saveProfile: async (input) => {
      await profileM.mutateAsync(input);
      await Promise.all([invalidate(), utils.jobs.profile.invalidate()]);
    },
    fetchPosting: (url) => fetchM.mutateAsync({ url }),
    score: async (id) => {
      await scoreM.mutateAsync({ id }).catch(() => null);
      await invalidate();
    },
    generate: async (id, kind, instructions) => {
      const d = await genM.mutateAsync({ id, kind, instructions }).catch(() => undefined);
      await invalidate();
      return d;
    },
    saveDocument: async (input) => {
      await saveDocM.mutateAsync(input);
      await invalidate();
    },
    deleteDocument: (id) => delDocM.mutate({ id }),
    scanInbox: () => scanM.mutateAsync(),
    applySuggestion: async (s, stage) => {
      await applyM.mutateAsync({ jobId: s.jobId, threadId: s.threadId, stage, summary: s.summary });
      await invalidate();
    },
    dismissSuggestion: (s) => dismissM.mutate({ jobId: s.jobId, threadId: s.threadId }),
    addTask: async (job, title, dueDate) => {
      await taskM.mutateAsync({ title, description: [job.url, job.contactEmail].filter(Boolean).join("\n"), dueDate, priority: job.stage === "interview" || job.stage === "offer" ? "high" : "medium", labels: ["job"], projectName: "Job search" });
      toast.success("Added to Tasks");
    },
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useDiscovery: (id) => api.jobs.getDiscovery.useQuery({ id: id ?? "" }, { enabled: !!id }).data,
    discoverNow: async () => {
      const r = await discM.mutateAsync().catch(() => undefined);
      await invalidate();
      return r;
    },
    saveDiscovery: async (id) => {
      patchDisc((ds) => ds.filter((d) => d.id !== id));
      const j = await saveDiscM.mutateAsync({ id }).catch(() => undefined);
      await invalidate();
      return j;
    },
    dismissDiscoveries: (ids) => {
      patchDisc((ds) => ds.filter((d) => !ids.includes(d.id)));
      dismissM2.mutate({ ids });
    },
    scoreDiscovery: async (id) => {
      await scoreDiscM.mutateAsync({ id }).catch(() => null);
      await Promise.all([invalidate(), utils.jobs.getDiscovery.invalidate()]);
    },
    saveDiscoverySettings: async (input) => {
      await discSetM.mutateAsync(input);
      await invalidate();
    },
  };
}
