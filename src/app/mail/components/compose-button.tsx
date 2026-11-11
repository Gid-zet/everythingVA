"use client";
import React from "react";
import { Pencil } from "lucide-react";
import { useAtom } from "jotai";
import { atom } from "jotai";
import { useLocalStorage } from "usehooks-ts";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type RouterOutputs } from "@/trpc/react";
import { Composer } from "./composer";

type Draft = RouterOutputs["mail"]["listDrafts"][number];

/** Open the compose drawer from anywhere (e.g. resuming a draft). */
export const composeAtom = atom<{ open: boolean; draft?: Draft | null }>({ open: false });

const ComposeButton = ({ isCollapsed = false }: { isCollapsed?: boolean }) => {
  const [state, setState] = useAtom(composeAtom);
  const [selectedAccount] = useLocalStorage("accountId", "");
  const { data: accounts } = api.mail.getAccounts.useQuery();
  const usable = accounts ?? [];
  const [fromId, setFromId] = React.useState<string>("");

  // Default "From": the draft's account, the selected account, or the first one.
  React.useEffect(() => {
    if (!state.open) return;
    setFromId(
      state.draft?.accountId ??
        (selectedAccount && selectedAccount !== "all" ? selectedAccount : usable[0]?.id ?? ""),
    );
  }, [state.open, state.draft?.accountId, selectedAccount, usable]);

  // Ctrl/Cmd + Shift + C opens compose (plain Ctrl+C must stay "copy").
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName ?? "") ||
        (document.activeElement as HTMLElement | null)?.isContentEditable;
      if (!typing && e.key.toLowerCase() === "c" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        setState({ open: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setState]);

  return (
    <Drawer open={state.open} onOpenChange={(open) => setState(open ? { open, draft: state.draft } : { open: false })}>
      <DrawerTrigger asChild>
        {isCollapsed ? (
          <Button size="icon" className="size-9 rounded-lg" aria-label="Compose">
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button className="h-9 w-full justify-start gap-2 rounded-lg px-3 text-[13px] shadow-sm">
            <Pencil className="size-4" />
            Compose
          </Button>
        )}
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-w-3xl">
        <DrawerHeader className="flex flex-row items-center gap-3 text-left">
          <div className="min-w-0 flex-1">
            <DrawerTitle>{state.draft ? "Draft" : "New message"}</DrawerTitle>
            <DrawerDescription className="sr-only">Write and send an email</DrawerDescription>
          </div>
          {usable.length > 1 && (
            <Select value={fromId} onValueChange={setFromId} disabled={!!state.draft}>
              <SelectTrigger className="h-8 w-auto min-w-[220px] text-[13px]" aria-label="Send from">
                <span className="mr-1 text-muted-foreground">From</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {usable.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.emailAddress}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </DrawerHeader>
        {fromId ? (
          <div className="pb-4">
            <Composer
              key={`${fromId}-${state.draft?.id ?? "new"}`}
              accountId={fromId}
              draft={state.draft}
              initialMode="new"
              onSent={() => setState({ open: false })}
            />
          </div>
        ) : (
          <p className="px-4 pb-6 text-sm text-muted-foreground">Connect an email account to send mail.</p>
        )}
      </DrawerContent>
    </Drawer>
  );
};

export default ComposeButton;
