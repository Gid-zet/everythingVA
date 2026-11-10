"use client";
import React from "react";
import { Nav } from "./nav";

import {
  FileText,
  Inbox,
  Send,
  Plug,
  FolderKanban,
  CalendarDays,
} from "lucide-react";

import { useLocalStorage } from "usehooks-ts";
import { api } from "@/trpc/react";

type Props = { isCollapsed: boolean };

const fmt = (n?: number) =>
  n === undefined || n === 0 ? undefined : n > 999 ? "999+" : String(n);

const SideBar = ({ isCollapsed }: Props) => {
  const [tab] = useLocalStorage("normalhuman-tab", "inbox");
  const [accountId] = useLocalStorage("accountId", "");

  // One query for all three counts (was three separate queries polling every 5s).
  const { data: counts } = api.mail.getThreadCounts.useQuery(
    { accountId },
    { enabled: !!accountId, refetchInterval: 60_000, refetchOnWindowFocus: true },
  );

  return (
    <>
      <Nav
        isCollapsed={isCollapsed}
        links={[
          { title: "Inbox", label: fmt(counts?.inbox), icon: Inbox, active: tab === "inbox" },
          { title: "Drafts", label: fmt(counts?.drafts), icon: FileText, active: tab === "drafts" },
          { title: "Sent", label: fmt(counts?.sent), icon: Send, active: tab === "sent" },
        ]}
      />
      <Nav
        isCollapsed={isCollapsed}
        heading="Workspace"
        links={[
          { title: "Organizer", icon: FolderKanban, active: tab === "organizer" },
          { title: "Calendar", icon: CalendarDays, active: false, href: "/calendar" },
          {
            title: "Email Setup",
            tab: "setup",
            icon: Plug,
            active: tab === "setup" || tab === "email setup",
          },
        ]}
      />
    </>
  );
};

export default SideBar;
