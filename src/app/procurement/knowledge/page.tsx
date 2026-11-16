"use client";
import React from "react";
import { FileText, Loader2, Lock, ShieldCheck, Trash2, Upload, Eye, History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, type RouterOutputs } from "@/trpc/react";
import { CATEGORY_LABELS } from "@/server/procurement/types";
import { EmptyState, Field, PageHeader, VerificationBadge, formatDate, inputClass } from "../components/bits";

type Doc = RouterOutputs["procurement"]["documents"][number];
type Category = keyof typeof CATEGORY_LABELS;

export default function KnowledgePage() {
  const utils = api.useUtils();
  const { data: overview } = api.procurement.overview.useQuery();
  const [showOld, setShowOld] = React.useState(false);
  const { data: docs, isLoading } = api.procurement.documents.useQuery({ includeOld: showOld });
  const [upload, setUpload] = React.useState<{ replace?: Doc } | null>(null);
  const [viewing, setViewing] = React.useState<string | null>(null);
  const role = overview?.workspace.role;
  const isAdmin = role === "owner" || role === "admin";
  const isEditor = !!role && role !== "viewer";
  const refresh = () => void utils.procurement.invalidate();
  const verify = api.procurement.verifyDocument.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const remove = api.procurement.deleteDocument.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const updateDoc = api.procurement.updateDocument.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });

  const grouped = React.useMemo(() => {
    const m = new Map<Category, Doc[]>();
    for (const d of docs ?? []) m.set(d.category, [...(m.get(d.category) ?? []), d]);
    return [...m.entries()].sort((a, b) => CATEGORY_LABELS[a[0]].localeCompare(CATEGORY_LABELS[b[0]]));
  }, [docs]);

  return (
    <>
      <PageHeader
        title="Knowledge base"
        description="Verified company documents the agents can draw on: capability statements, certificates, insurance, past performance, bios and templates. Text is extracted on upload."
        actions={
          isEditor && (
            <Button onClick={() => setUpload({})}>
              <Upload className="mr-2 size-4" /> Add document
            </Button>
          )
        }
      />

      <label className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} /> Show earlier versions
      </label>

      {isLoading ? (
        <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />
      ) : !docs?.length ? (
        <EmptyState title="No documents yet">Start with your capability statement, WOSB and WBENC certificates, and insurance certificate.</EmptyState>
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, list]) => (
            <div key={category}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CATEGORY_LABELS[category]}</p>
              <ul className="divide-y rounded-xl border bg-card">
                {list.map((d) => {
                  const expired = d.expiresAt && new Date(d.expiresAt) < new Date();
                  return (
                    <li key={d.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                      <FileText className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{d.name}</p>
                          <VerificationBadge status={d.status} />
                          {d.version > 1 && <span className="text-[11px] text-muted-foreground">v{d.version}</span>}
                          {!d.isLatest && <span className="text-[11px] text-muted-foreground">(superseded)</span>}
                          {d.access === "admins_only" && <Lock className="size-3 text-muted-foreground" aria-label="Admins only" />}
                          {expired && <span className="text-[11px] font-medium text-rose-600">Expired</span>}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[d.fileName, d.sizeBytes ? `${Math.max(1, Math.round(d.sizeBytes / 1024))} KB` : null, `Added ${formatDate(d.uploadedAt)}`, d.expiresAt ? `Expires ${formatDate(d.expiresAt)}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setViewing(d.id)}>
                          <Eye className="mr-1.5 size-3.5" /> View
                        </Button>
                        {isAdmin && d.status !== "verified" && d.isLatest && (
                          <Button size="sm" variant="outline" onClick={() => verify.mutate({ id: d.id, status: "verified" })}>
                            <ShieldCheck className="mr-1.5 size-3.5" /> Verify
                          </Button>
                        )}
                        {isEditor && d.isLatest && (
                          <Button size="sm" variant="ghost" onClick={() => setUpload({ replace: d })}>
                            <History className="mr-1.5 size-3.5" /> New version
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => updateDoc.mutate({ id: d.id, access: d.access === "admins_only" ? "all_members" : "admins_only" })}
                            title={d.access === "admins_only" ? "Visible to admins only. Click to share with all members." : "Visible to all members. Click to restrict to admins."}
                          >
                            <Lock className="size-3.5" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            aria-label="Delete"
                            onClick={() => confirm(`Delete "${d.name}" (version ${d.version})? This can't be undone.`) && remove.mutate({ id: d.id })}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {upload && <UploadDialog replace={upload.replace} onClose={() => setUpload(null)} />}
      {viewing && <ViewDialog id={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function UploadDialog({ replace, onClose }: { replace?: Doc; onClose: () => void }) {
  const utils = api.useUtils();
  const [mode, setMode] = React.useState<"file" | "text">("file");
  const [file, setFile] = React.useState<File | null>(null);
  const [name, setName] = React.useState(replace?.name ?? "");
  const [category, setCategory] = React.useState<Category>(replace?.category ?? "capability_statement");
  const [expiresAt, setExpiresAt] = React.useState(replace?.expiresAt ? new Date(replace.expiresAt).toISOString().slice(0, 10) : "");
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const createText = api.procurement.createTextDocument.useMutation();

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "text" && !replace) {
        await createText.mutateAsync({ name, category, text, expiresAt: expiresAt ? new Date(expiresAt) : null });
        toast.success("Document added");
      } else {
        if (!file) throw new Error("Choose a file.");
        const body = new FormData();
        body.set("file", file);
        body.set("name", name || file.name.replace(/\.[^.]+$/, ""));
        body.set("category", category);
        if (expiresAt) body.set("expiresAt", expiresAt);
        if (replace) body.set("previousVersionId", replace.id);
        const res = await fetch("/api/procurement/documents", { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { error?: string; characters?: number; version?: number };
        if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);
        toast.success(`Uploaded${json.version && json.version > 1 ? ` as version ${json.version}` : ""}: ${json.characters?.toLocaleString()} characters of text extracted.`);
      }
      void utils.procurement.invalidate();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{replace ? `New version of “${replace.name}”` : "Add a document"}</DialogTitle>
        </DialogHeader>
        {!replace && (
          <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
            {(["file", "text"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md px-3 py-1.5 ${mode === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
              >
                {m === "file" ? "Upload a file" : "Paste text"}
              </button>
            ))}
          </div>
        )}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === "file" || replace ? (
            <Field label="File" hint="PDF, Word (.docx) or text, up to 4 MB. Scanned PDFs need OCR, which isn't available yet.">
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          ) : (
            <Field label="Text">
              <textarea required rows={8} className={`${inputClass} h-auto py-2`} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
          )}
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to the file name" required={mode === "text" && !replace} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Expires" hint="Certificates and insurance">
              <input type="date" className={inputClass} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground">New documents start unverified. An admin verifies them after checking the original.</p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              {busy ? "Extracting text…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ViewDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = api.procurement.document.useQuery({ id });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{data?.name ?? "Document"}</DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <Loader2 className="mx-auto my-10 size-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {CATEGORY_LABELS[data.category]} · version {data.version} · {data.text.length.toLocaleString()} characters · {data.status}
              {data.verifiedAt ? ` ${formatDate(data.verifiedAt)}` : ""}
            </p>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-4 font-sans text-sm leading-relaxed">{data.text}</pre>
            {data.versions.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Earlier versions: {data.versions.map((v) => `v${v.version} (${formatDate(v.uploadedAt)})`).join(", ")}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
