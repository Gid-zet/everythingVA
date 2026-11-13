"use client";
import React from "react";
import { ChevronDown, Reply } from "lucide-react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { useThread } from "../use-thread";
import { useCurrentThread } from "../use-threads";
import { Composer } from "./composer";

/**
 * Reply area under the open thread. It starts collapsed to a slim bar so the
 * email can be read in full; it opens on "Reply" (or straight away when a
 * draft was autosaved) and can be collapsed again without losing the text.
 */
const ReplyBox = () => {
  const [threadId] = useThread();
  const { data: thread } = useCurrentThread(threadId);
  const accountId = thread?.accountId;
  const { data: draft, isLoading } = api.mail.getDraftForThread.useQuery(
    { accountId: accountId ?? "", threadId: threadId ?? "" },
    { enabled: !!accountId && !!threadId },
  );
  if (!thread || !accountId || isLoading) return null;
  return <ReplyPanel key={`${thread.id}-${draft?.id ?? "none"}`} accountId={accountId} thread={thread} draft={draft} />;
};

function ReplyPanel({
  accountId,
  thread,
  draft,
}: {
  accountId: string;
  thread: NonNullable<React.ComponentProps<typeof Composer>["thread"]>;
  draft: React.ComponentProps<typeof Composer>["draft"];
}) {
  const [open, setOpen] = React.useState(!!draft);
  const latest = thread.emails?.[thread.emails.length - 1];
  const to = latest?.from?.name || latest?.from?.address;

  return (
    <div>
      {!open && (
        <div className="flex items-center gap-2 px-4 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-background px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
          >
            <Reply className="size-4 shrink-0" />
            <span className="truncate">{to ? `Reply to ${to}…` : "Write a reply…"}</span>
          </button>
        </div>
      )}
      {/* Kept mounted while collapsed so the typed reply isn't lost. */}
      <div className={open ? "relative" : "hidden"}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-1.5 z-10 size-7 text-muted-foreground"
          onClick={() => setOpen(false)}
          aria-label="Collapse reply"
          title="Collapse reply"
        >
          <ChevronDown className="size-4" />
        </Button>
        <Composer accountId={accountId} thread={thread} draft={draft} compact onSent={() => setOpen(false)} />
      </div>
    </div>
  );
}

export default ReplyBox;
