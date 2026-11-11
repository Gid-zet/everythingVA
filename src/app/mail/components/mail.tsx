"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AccountSwitcher } from "@/app/mail/components/account-switcher";
import { ThreadDisplay } from "./thread-display";
import { ThreadList } from "./thread-list";
import { useLocalStorage } from "usehooks-ts";
import SideBar from "./sidebar";
import SearchBar from "./search-bar";
import { isSearchingAtom } from "@/lib/atoms";
import { useAtom } from "jotai";
import AskAI from "./ask-ai";
import { EmailOrganizer } from "./email-organizer";
import { AccountsPanel } from "./accounts-panel";
import ComposeButton from "./compose-button";
import SidebarFooter from "./sidebar-footer";
import { BulkUnsubscribe } from "./bulk-unsubscribe";
import { useSingleAccount, SingleAccountPicker } from "../use-single-account";
import { useBackgroundSync } from "../use-background-sync";

interface MailProps {
  defaultLayout: number[] | undefined;
  defaultCollapsed?: boolean;
  navCollapsedSize: number;
}

export function Mail({
  defaultLayout = [20, 32, 48],
  defaultCollapsed = false,
  navCollapsedSize,
}: MailProps) {
  const [done, setDone] = useLocalStorage("normalhuman-done", false);
  const [tab, setTab] = useLocalStorage("normalhuman-tab", "inbox");
  const [accountId] = useLocalStorage("accountId", "");
  // Organizer & co. need one mailbox; in "All inboxes" mode this is the picked one.
  const { accountId: singleAccountId, isLoading: accountsLoading } = useSingleAccount();
  useBackgroundSync();
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);
  
  // Normalize tab value for comparison (handle "email setup" or "setup")
  const isSetupTab = tab === "accounts" || tab === "setup" || tab === "email setup";

  // OAuth callbacks land on /mail?tab=accounts&connected=… → open the Accounts panel.
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "accounts") setTab("accounts");
  }, [setTab]);
  const tabTitle =
    tab === "drafts"
      ? "Drafts"
      : tab === "sent"
        ? "Sent"
        : tab === "snoozed"
          ? "Snoozed"
          : tab === "trash"
            ? "Trash"
            : tab === "starred"
              ? "Starred"
              : tab === "spam"
                ? "Spam"
                : accountId === "all"
                  ? "All inboxes"
                  : "Inbox";
  // Snoozed and Trash are single lists; the others split active / archived.
  const hasArchiveSplit = tab === "inbox" || tab === "sent" || tab === "drafts";

  // Clean up corrupted cookies on mount
  React.useEffect(() => {
    try {
      // Check if the layout cookie is valid
      const layoutCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith("react-resizable-panels:layout:mail="));

      if (layoutCookie) {
        const layoutValue = layoutCookie.split("=")[1];
        if (layoutValue) {
          JSON.parse(layoutValue); // This will throw if invalid
        }
      }
    } catch (error) {
      console.warn("Clearing corrupted layout cookie");
      document.cookie =
        "react-resizable-panels:layout:mail=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    }

    try {
      // Check if the collapsed cookie is valid
      const collapsedCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith("react-resizable-panels:collapsed="));

      if (collapsedCookie) {
        const collapsedValue = collapsedCookie.split("=")[1];
        if (collapsedValue) {
          JSON.parse(collapsedValue); // This will throw if invalid
        }
      }
    } catch (error) {
      console.warn("Clearing corrupted collapsed cookie");
      document.cookie =
        "react-resizable-panels:collapsed=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    }
  }, []);

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={(sizes: number[]) => {
          try {
            document.cookie = `react-resizable-panels:layout:mail=${JSON.stringify(
              sizes,
            )}`;
          } catch (error) {
            console.warn("Failed to save layout cookie:", error);
          }
        }}
        className="h-full min-h-screen items-stretch"
        id="mail"
      >
        <ResizablePanel
          defaultSize={defaultLayout[0]}
          collapsedSize={navCollapsedSize}
          collapsible={true}
          minSize={12}
          maxSize={35}
          onCollapse={() => {
            setIsCollapsed(true);
            try {
              document.cookie = `react-resizable-panels:collapsed=${JSON.stringify(
                true,
              )}`;
            } catch (error) {
              console.warn("Failed to save collapsed cookie:", error);
            }
          }}
          onResize={() => {
            setIsCollapsed(false);
            try {
              document.cookie = `react-resizable-panels:collapsed=${JSON.stringify(
                false,
              )}`;
            } catch (error) {
              console.warn("Failed to save collapsed cookie:", error);
            }
          }}
          className={cn(
            "bg-sidebar",
            isCollapsed &&
              "min-w-[50px] transition-all duration-300 ease-in-out",
          )}
        >
          <div className="flex h-full flex-1 flex-col">
            <div
              className={cn(
                "flex h-[52px] items-center justify-center",
                isCollapsed ? "h-[52px]" : "px-3",
              )}
            >
              <AccountSwitcher isCollapsed={isCollapsed} />
            </div>
            <div className={cn("pb-1", isCollapsed ? "flex justify-center" : "px-3")}>
              <ComposeButton isCollapsed={isCollapsed} />
            </div>
            <SideBar isCollapsed={isCollapsed} />
            <div className="flex-1"></div>
            <AskAI isCollapsed={isCollapsed} />
            <SidebarFooter isCollapsed={isCollapsed} />
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={defaultLayout[1]} minSize={30}>
          {tab === "organizer" ? (
            <div className="h-full overflow-auto">
              <SingleAccountPicker label="Organizing" className="border-b px-4 py-2" />
              {singleAccountId ? (
                <EmailOrganizer key={singleAccountId} accountId={singleAccountId} />
              ) : accountsLoading ? null : (
                <p className="p-6 text-sm text-muted-foreground">Connect an email account to use the organizer.</p>
              )}
            </div>
          ) : tab === "unsubscribe" ? (
            <BulkUnsubscribe />
          ) : isSetupTab ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-sm space-y-4 text-[13px] text-muted-foreground">
                <p className="text-base font-semibold text-foreground">How connecting works</p>
                <p>
                  You sign in on Google&apos;s, Microsoft&apos;s or your mail server&apos;s own page. EverythingVA receives an access
                  grant, never your password, and stores it encrypted on our servers. Your browser never sees it.
                </p>
                <p>
                  New mail and calendar changes arrive through provider notifications, with a background check as a fallback.
                  Archive, delete, star, read state, labels and RSVPs are written back to your mailbox.
                </p>
                <p>Disconnecting revokes access and deletes our copy. Nothing is removed from your mailbox.</p>
              </div>
            </div>
          ) : (
            <Tabs
              defaultValue="inbox"
              value={done ? "done" : "inbox"}
              onValueChange={(tab) => {
                if (tab === "done") {
                  setDone(true);
                } else {
                  setDone(false);
                }
              }}
            >
              <div className="flex h-[52px] items-center border-b px-4">
                <h1 className="text-[15px] font-semibold tracking-tight">
                  {tabTitle}
                </h1>
                <TabsList
                  className={cn(
                    "ml-auto h-8 rounded-lg p-0.5",
                    !hasArchiveSplit && "hidden",
                  )}
                >
                  <TabsTrigger
                    value="inbox"
                    className="h-7 rounded-md px-3 text-xs"
                  >
                    {tabTitle}
                  </TabsTrigger>
                  <TabsTrigger
                    value="done"
                    className="h-7 rounded-md px-3 text-xs"
                  >
                    Archived
                  </TabsTrigger>
                </TabsList>
              </div>
              <SearchBar />
              <TabsContent value="inbox" className="m-0">
                <ThreadList />
              </TabsContent>
              <TabsContent value="done" className="m-0">
                <ThreadList />
              </TabsContent>
            </Tabs>
          )}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={defaultLayout[2]} minSize={30}>
          {isSetupTab ? (
            <div className="h-full overflow-y-auto">
              <AccountsPanel />
            </div>
          ) : (
            <ThreadDisplay />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  );
}
