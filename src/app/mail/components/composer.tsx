"use client";

import React from "react";
import { format } from "date-fns";
import { Forward, Paperclip, Reply, ReplyAll } from "lucide-react";
import { toast } from "sonner";

import { api, type RouterOutputs } from "@/trpc/react";
import { cn } from "@/lib/utils";
import ErrorBoundary from "@/components/error-boundary";
import { checkAttachmentLimits, processAttachments } from "@/lib/file-utils";
import EmailEditor from "./email-editor";
import type { EmailAttachment } from "./email-editor/file-attachment";

export type ComposeMode = "new" | "reply" | "replyAll" | "forward";
type Tag = { label: string; value: string };
type Thread = NonNullable<RouterOutputs["mail"]["getThreadById"]>;

const toTags = (list: { name?: string | null; address: string }[] = []): Tag[] =>
  list.filter((a) => a.address).map((a) => ({ label: a.name || a.address, value: a.address }));
const toAddresses = (tags: Tag[]) => tags.map((t) => ({ name: t.label === t.value ? t.value : t.label, address: t.value }));
const prefixed = (prefix: "Re:" | "Fwd:", subject: string) =>
  new RegExp(`^${prefix}`, "i").test(subject.trim()) ? subject : `${prefix} ${subject}`;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * One composer for new mail, replies, reply-all and forwards.
 * - Recipients and subject are derived from the thread per mode, then editable;
 *   what you see is exactly what is sent.
 * - Body, recipients and subject autosave as a draft (debounced), and the
 *   draft is restored when you come back to the thread.
 * - Forwarding re-attaches the original attachments server-side.
 */
export function Composer({
  accountId,
  thread,
  initialMode = thread ? "reply" : "new",
  onSent,
  draft,
  compact,
}: {
  accountId: string;
  thread?: Thread | null;
  initialMode?: ComposeMode;
  onSent?: () => void;
  draft?: RouterOutputs["mail"]["listDrafts"][number] | null;
  compact?: boolean;
}) {
  const utils = api.useUtils();
  const [mode, setMode] = React.useState<ComposeMode>((draft?.mode as ComposeMode) ?? initialMode);
  const [draftId, setDraftId] = React.useState<string | undefined>(draft?.id);
  const [savedAt, setSavedAt] = React.useState<Date | null>(draft ? new Date(draft.updatedAt) : null);

  const replyTo = api.mail.getReplyDetails.useQuery(
    { accountId, threadId: thread?.id ?? "", replyType: mode === "replyAll" ? "replyAll" : "reply" },
    { enabled: !!thread && (mode === "reply" || mode === "replyAll") && !draft, retry: false },
  );

  const last = thread?.emails.at(-1);
  const [to, setTo] = React.useState<Tag[]>(toTags((draft?.to as never) ?? []));
  const [cc, setCc] = React.useState<Tag[]>(toTags((draft?.cc as never) ?? []));
  const [bcc, setBcc] = React.useState<Tag[]>(toTags((draft?.bcc as never) ?? []));
  const [subject, setSubject] = React.useState(draft?.subject ?? "");
  const [body, setBody] = React.useState<string | undefined>(draft?.body);
  const bodyRef = React.useRef(draft?.body ?? "");

  // Derive recipients/subject/body when the mode changes (not for restored drafts).
  const restored = React.useRef(!!draft);
  React.useEffect(() => {
    if (restored.current) {
      restored.current = false;
      return;
    }
    if (!thread) return;
    if (mode === "forward") {
      setTo([]);
      setCc([]);
      setSubject(prefixed("Fwd:", thread.subject));
      const header = last
        ? `<p></p><p>---------- Forwarded message ----------<br/>From: ${escapeHtml(last.from.name ?? "")} &lt;${escapeHtml(last.from.address)}&gt;<br/>Date: ${escapeHtml(format(new Date(last.sentAt), "PPpp"))}<br/>Subject: ${escapeHtml(thread.subject)}</p>`
        : "";
      setBody(`${header}${last?.body ?? ""}`);
      bodyRef.current = `${header}${last?.body ?? ""}`;
    } else if (replyTo.data) {
      setTo(toTags(replyTo.data.to));
      setCc(toTags(replyTo.data.cc));
      setSubject(prefixed("Re:", replyTo.data.subject));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, replyTo.data, thread?.id]);

  // ── Autosave ──
  const save = api.mail.saveDraft.useMutation({
    onSuccess: (d) => {
      setDraftId(d.id);
      setSavedAt(new Date(d.updatedAt));
      void utils.mail.listDrafts.invalidate();
    },
  });
  const timer = React.useRef<ReturnType<typeof setTimeout>>();
  const scheduleSave = React.useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const html = bodyRef.current;
      const empty = !html.replace(/<[^>]*>/g, "").trim() && to.length === 0;
      if (empty && !draftId) return;
      save.mutate({
        id: draftId,
        accountId,
        threadId: thread?.id ?? null,
        mode,
        subject,
        body: html,
        to: toAddresses(to),
        cc: toAddresses(cc),
        bcc: toAddresses(bcc),
        inReplyTo: mode === "reply" || mode === "replyAll" ? (replyTo.data?.id ?? null) : null,
      });
    }, 1200);
  }, [accountId, bcc, cc, draftId, mode, replyTo.data?.id, save, subject, thread?.id, to]);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  React.useEffect(() => {
    if (to.length || cc.length || subject) scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, bcc, subject]);

  // ── Send ──
  const send = api.mail.sendEmail.useMutation();
  const deleteDraft = api.mail.deleteDraft.useMutation();
  const [processing, setProcessing] = React.useState(false);

  const handleSend = async (html: string, attachments?: EmailAttachment[]) => {
    if (to.length + cc.length + bcc.length === 0) {
      toast.error("Add at least one recipient.");
      return false;
    }
    if (attachments?.length) {
      const check = checkAttachmentLimits(attachments);
      if (!check.isValid) {
        toast.error(check.error);
        return false;
      }
    }
    clearTimeout(timer.current);
    setProcessing(true);
    try {
      const processed = attachments?.length ? await processAttachments(attachments) : [];
      const forwarded =
        mode === "forward"
          ? thread?.emails.flatMap((e) => e.attachments.map((a) => ({ messageId: e.id, attachmentId: a.id }))) ?? []
          : [];
      const me = thread?.account ?? null;
      await send.mutateAsync({
        accountId,
        threadId: mode === "forward" ? undefined : thread?.id,
        body: html,
        subject: subject || "(no subject)",
        // The server always sends as the connected mailbox.
        from: { name: me?.name ?? "", address: me?.emailAddress ?? "" },
        replyTo: { name: me?.name ?? "", address: me?.emailAddress ?? "" },
        to: toAddresses(to),
        cc: toAddresses(cc),
        bcc: toAddresses(bcc),
        inReplyTo: mode === "reply" || mode === "replyAll" ? (replyTo.data?.id ?? undefined) : undefined,
        attachments: processed,
        forwardAttachments: forwarded.length ? forwarded : undefined,
        draftId,
      });
      toast.success(mode === "forward" ? "Forwarded" : "Sent");
      setDraftId(undefined);
      setSavedAt(null);
      bodyRef.current = "";
      void utils.mail.listDrafts.invalidate();
      void utils.mail.getThreads.invalidate();
      onSent?.();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send. Your draft is saved.");
      return false;
    } finally {
      setProcessing(false);
    }
  };

  const discard = async () => {
    clearTimeout(timer.current);
    if (draftId) await deleteDraft.mutateAsync({ accountId, id: draftId });
    setDraftId(undefined);
    setSavedAt(null);
    setBody("");
    bodyRef.current = "";
    void utils.mail.listDrafts.invalidate();
    onSent?.();
  };

  const modeTabs = thread ? (
    <div className="flex items-center gap-1 border-b px-3 py-1.5">
      {(
        [
          ["reply", "Reply", Reply],
          ["replyAll", "Reply all", ReplyAll],
          ["forward", "Forward", Forward],
        ] as const
      ).map(([m, label, Icon]) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          aria-pressed={mode === m}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors",
            mode === m ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
      {mode === "forward" && thread.emails.some((e) => e.attachments.length) && (
        <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Paperclip className="size-3" /> Original attachments included
        </span>
      )}
      {draftId && (
        <button type="button" onClick={() => void discard()} className="ml-auto text-[12px] text-muted-foreground hover:text-destructive">
          Discard draft
        </button>
      )}
    </div>
  ) : null;

  return (
    <ErrorBoundary>
      <div className={cn(compact && "max-h-[46vh] overflow-y-auto")}>
        <EmailEditor
          key={`${thread?.id ?? "new"}-${mode}`}
          accountIdOverride={accountId}
          headerSlot={modeTabs}
          toValues={to}
          ccValues={cc}
          bccValues={bcc}
          onToChange={setTo}
          onCcChange={setCc}
          onBccChange={setBcc}
          subject={subject}
          setSubject={setSubject}
          to={to.map((t) => t.value)}
          initialContent={body}
          onContentChange={(html) => {
            bodyRef.current = html;
            scheduleSave();
          }}
          statusText={save.isPending ? "Saving…" : savedAt ? `Draft saved ${format(savedAt, "h:mm a")}` : undefined}
          handleSend={handleSend}
          isSending={send.isPending || processing}
          defaultToolbarExpand={!thread || mode === "forward"}
        />
      </div>
    </ErrorBoundary>
  );
}
