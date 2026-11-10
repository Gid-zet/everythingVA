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
  AlarmClock,
  Trash2,
  MailMinus,
} from "lucide-react";

import { useLocalStorage } from "usehooks-ts";
import { api } from "@/trpc/react";

type Props = { isCollapsed: boolean };

const fmt = (n?: number) =>
  n === undefined || n === 0 ? undefined : n > 999 ? "999+" : String(n);

const SideBar = ({ isCollapsed }: Props) => {
  const [tab] = useLocalStorage("normalhuman-tab", "inbox");
  const [accountId] = useLocalStorage("accountId", "");

  // One query for all the counts (was three separate queries polling every 5s).
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
          { title: "Snoozed", label: fmt(counts?.snoozed), icon: AlarmClock, active: tab === "snoozed" },
          { title: "Trash", icon: Trash2, active: tab === "trash" },
        ]}
      />
      <Nav
        isCollapsed={isCollapsed}
        heading="Workspace"
        links={[
          { title: "Organizer", icon: FolderKanban, active: tab === "organizer" },
          { title: "Unsubscribe", icon: MailMinus, active: tab === "unsubscribe" },
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
