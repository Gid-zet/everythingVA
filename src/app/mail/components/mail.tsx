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
import AuthoriseButton from "@/components/authorise-button";
import PushCategoriesButton from "@/components/push-categories-button";
import ComposeButton from "./compose-button";
import SidebarFooter from "./sidebar-footer";
import { BulkUnsubscribe } from "./bulk-unsubscribe";

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
  const [tab] = useLocalStorage("normalhuman-tab", "inbox");
  const [accountId] = useLocalStorage("accountId", "");
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);
  
  // Normalize tab value for comparison (handle "email setup" or "setup")
  const isSetupTab = tab === "setup" || tab === "email setup";
  const tabTitle =
    tab === "drafts"
      ? "Drafts"
      : tab === "sent"
        ? "Sent"
        : tab === "snoozed"
          ? "Snoozed"
          : tab === "trash"
            ? "Trash"
            : "Inbox";
  // Snoozed and Trash are single lists; the others split active / archived.
  const hasArchiveSplit = tab !== "snoozed" && tab !== "trash";

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
              <EmailOrganizer accountId={accountId} />
            </div>
          ) : tab === "unsubscribe" ? (
            <BulkUnsubscribe />
          ) : isSetupTab ? (
            <div className="flex h-full flex-col items-center justify-center p-8">
              <div className="w-full max-w-md space-y-4">
                <div className="mb-6 text-center">
                  <h2 className="text-2xl font-semibold tracking-tight">Email Setup</h2>
                  <p className="mt-2 text-muted-foreground">
                    Connect your email account to get started
                  </p>
                </div>
                <AuthoriseButton />
                <div className="mt-6 border-t pt-6">
                  <div className="mb-4 text-center">
                    <h3 className="text-lg font-semibold">Email Organization</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Push organizer categories as labels to your email provider
                    </p>
                  </div>
                  <PushCategoriesButton />
                </div>
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
            <div className="flex h-full items-center justify-center p-8">
              <div className="text-center text-muted-foreground">
                <p className="text-lg">Email Setup</p>
                <p className="mt-2 text-sm">
                  Use the authorize and sync buttons to connect your email account
                </p>
              </div>
            </div>
          ) : (
            <ThreadDisplay />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  );
}
