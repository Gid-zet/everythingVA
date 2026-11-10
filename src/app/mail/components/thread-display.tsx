import { Check, ChevronDown, ChevronUp, MailOpen, Undo2, X } from "lucide-react";
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

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-2 rounded border bg-muted px-1 font-sans text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}

export function ThreadDisplay() {
  const [threadId, setThreadId] = useThread();
  const { threads, done } = useThreads();
  const [isSearching] = useAtom(isSearchingAtom);
  const { markDone, markUndone } = useThreadActions();
  const { data: thread, isLoading } = useCurrentThread(threadId);

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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-[13px]"
              disabled={!thread}
              onClick={() =>
                threadId && void (done ? markUndone : markDone)([threadId])
              }
            >
              {done ? <Undo2 className="size-4" /> : <Check className="size-4" />}
              {done ? "Move to inbox" : "Done"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {done ? "Move back to inbox" : "Mark done"}
            <Kbd>{done ? "U" : "D"}</Kbd>
          </TooltipContent>
        </Tooltip>

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
            <div className="flex flex-col gap-3 px-4 pb-6 sm:px-6">
              {thread.emails.map((email, i) => (
                <EmailDisplay
                  key={email.id}
                  email={email}
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
    </div>
  );
}
