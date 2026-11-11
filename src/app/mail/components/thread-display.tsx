import {
  AlarmClock,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  CalendarPlus,
  Inbox,
  Mail,
  MailOpen,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import React from "react";
import { format } from "date-fns";
import { useAtom } from "jotai";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import EmailDisplay from "./email-display";
import { useThread } from "../use-thread";
import useThreads, { useCurrentThread } from "../use-threads";
import { useThreadActions } from "../use-thread-actions";
import { isSearchingAtom } from "@/lib/atoms";
import SearchDisplay from "./search-display";
import ReplyBox from "./reply-box";
import { SnoozeMenu } from "./snooze-menu";
import { ThreadInsights } from "./thread-insights";
import { EventEditorDialog } from "@/app/calendar/components/event-editor";
import { cn } from "@/lib/utils";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-2 rounded border bg-muted px-1 font-sans text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}

function ToolbarButton({
  icon,
  label,
  hint,
  kbd,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label?: string;
  hint: string;
  kbd?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size={label ? "sm" : "icon"}
          className={label ? "h-8 gap-1.5 px-2.5 text-[13px]" : "size-8"}
          disabled={disabled}
          onClick={onClick}
          aria-label={label ? undefined : hint}
        >
          {icon}
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {hint}
        {kbd && <Kbd>{kbd}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

export function ThreadDisplay() {
  const [threadId, setThreadId] = useThread();
  const { threads, mode, isUnified } = useThreads();
  const [isSearching] = useAtom(isSearchingAtom);
  const actions = useThreadActions();
  const { data: thread, isLoading } = useCurrentThread(threadId);
  const [scheduling, setScheduling] = React.useState(false);

  // Opening a thread marks it read (in the app and at the provider), once.
  const markedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!thread || markedRef.current === thread.id) return;
    markedRef.current = thread.id;
    if (thread.emails.some((e) => e.status === "unread")) void actions.setRead([thread.id], true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id]);

  const idx = threads.findIndex((t) => t.id === threadId);
  const go = (delta: number) => {
    const next = threads[idx + delta];
    if (next) setThreadId(next.id);
  };

  const participants = thread
    ? Array.from(
        new Set(thread.emails.map((e) => e.from.name || e.from.address)),
      )
    : [];

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Toolbar */}
      <div className="flex h-[52px] items-center gap-1 border-b px-3">
        {mode === "active" && (
          <>
            <ToolbarButton
              icon={<Archive className="size-4" />}
              label="Archive"
              hint="Archive"
              kbd="E"
              disabled={!thread}
              onClick={() => threadId && void actions.archive([threadId])}
            />
            <SnoozeMenu
              disabled={!thread}
              onSnooze={(until) => threadId && void actions.snooze([threadId], until)}
            >
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-[13px]"
                disabled={!thread}
              >
                <AlarmClock className="size-4" />
                Snooze
              </Button>
            </SnoozeMenu>
          </>
        )}
        {mode === "done" && (
          <ToolbarButton
            icon={<Undo2 className="size-4" />}
            label="Move to inbox"
            hint="Move back to inbox"
            kbd="U"
            disabled={!thread}
            onClick={() => threadId && void actions.unarchive([threadId])}
          />
        )}
        {mode === "snoozed" && (
          <ToolbarButton
            icon={<Inbox className="size-4" />}
            label="Unsnooze"
            hint="Move back to inbox now"
            disabled={!thread}
            onClick={() => threadId && void actions.unsnooze([threadId])}
          />
        )}
        {mode === "trash" ? (
          <ToolbarButton
            icon={<ArchiveRestore className="size-4" />}
            label="Restore"
            hint="Restore from trash"
            disabled={!thread}
            onClick={() => threadId && void actions.restore([threadId])}
          />
        ) : (
          <ToolbarButton
            icon={<Trash2 className="size-4" />}
            hint="Delete"
            kbd="#"
            disabled={!thread}
            onClick={() => threadId && void actions.trash([threadId])}
          />
        )}
        {mode === "spam" ? (
          <ToolbarButton
            icon={<ShieldCheck className="size-4" />}
            label="Not spam"
            hint="Move back to inbox"
            disabled={!thread}
            onClick={() => threadId && void actions.notSpam([threadId])}
          />
        ) : mode !== "trash" ? (
          <ToolbarButton
            icon={<ShieldAlert className="size-4" />}
            hint="Report spam"
            kbd="!"
            disabled={!thread}
            onClick={() => threadId && void actions.spam([threadId])}
          />
        ) : null}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolbarButton
          icon={
            <Star
              className={cn("size-4", thread?.starred && "fill-amber-400 text-amber-500")}
            />
          }
          hint={thread?.starred ? "Remove star" : "Star"}
          kbd="S"
          disabled={!thread}
          onClick={() => thread && void actions.setStarred([thread.id], !thread.starred)}
        />
        <ToolbarButton
          icon={<Mail className="size-4" />}
          hint="Mark as unread"
          kbd="Shift U"
          disabled={!thread}
          onClick={() => {
            if (!thread) return;
            markedRef.current = thread.id;
            void actions.setRead([thread.id], false, { silent: false });
          }}
        />
        <ToolbarButton
          icon={<CalendarPlus className="size-4" />}
          hint="Add to calendar"
          disabled={!thread}
          onClick={() => setScheduling(true)}
        />
        {mode === "snoozed" && thread?.snoozedUntil && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">
            <AlarmClock className="size-3" />
            {format(new Date(thread.snoozedUntil), "EEE, MMM d 'at' h:mm a")}
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          {thread && idx !== -1 && (
            <span className="mr-2 text-[11px] tabular-nums text-muted-foreground">
              {idx + 1} of {threads.length}
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={idx <= 0}
                onClick={() => go(-1)}
                aria-label="Previous thread"
              >
                <ChevronUp className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Previous<Kbd>K</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={idx === -1 || idx >= threads.length - 1}
                onClick={() => go(1)}
                aria-label="Next thread"
              >
                <ChevronDown className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Next<Kbd>J</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={!threadId}
                onClick={() => setThreadId(undefined)}
                aria-label="Close thread"
              >
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Close<Kbd>Esc</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {isSearching ? (
        <SearchDisplay />
      ) : thread ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <header className="px-6 pb-4 pt-6">
              <h2 className="text-balance text-xl font-semibold tracking-tight">
                {thread.subject || "(no subject)"}
              </h2>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {isUnified && (
                  <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground/70">
                    {thread.account.emailAddress}
                  </span>
                )}
                {thread.emails.length} message
                {thread.emails.length === 1 ? "" : "s"}
                {participants.length > 0 && (
                  <>
                    {" · "}
                    {participants.slice(0, 3).join(", ")}
                    {participants.length > 3 &&
                      ` +${participants.length - 3}`}
                  </>
                )}
              </p>
            </header>
            <div className="px-4 pb-3 sm:px-6">
              <ThreadInsights accountId={thread.accountId} threadId={thread.id} />
            </div>
            <div className="flex flex-col gap-3 px-4 pb-6 sm:px-6">
              {thread.emails.map((email, i) => (
                <EmailDisplay
                  key={email.id}
                  email={email}
                  accountId={thread.accountId}
                  defaultOpen={i >= thread.emails.length - 2}
                />
              ))}
            </div>
          </div>
          <div className="border-t bg-sidebar/60">
            <ReplyBox />
          </div>
        </div>
      ) : threadId && isLoading ? (
        <div className="space-y-3 p-6">
          <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          <div className="mt-6 h-48 animate-pulse rounded-xl bg-muted/70" />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl border bg-sidebar text-muted-foreground">
            <MailOpen className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium">No conversation selected</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pick a thread, or press <Kbd>J</Kbd> to start reading.
            </p>
          </div>
        </div>
      )}
      {thread && (
        <EventEditorDialog
          open={scheduling}
          onOpenChange={setScheduling}
          preset={{
            title: thread.subject,
            accountId: thread.accountId,
            description: `From email: ${thread.subject}`,
            attendees: Array.from(
              new Map(
                thread.emails
                  .flatMap((e) => [e.from, ...e.to, ...e.cc])
                  .filter((a) => a.address.toLowerCase() !== thread.account.emailAddress.toLowerCase())
                  .map((a) => [a.address.toLowerCase(), { email: a.address, name: a.name ?? null }]),
              ).values(),
            ),
          }}
        />
      )}
    </div>
  );
}
