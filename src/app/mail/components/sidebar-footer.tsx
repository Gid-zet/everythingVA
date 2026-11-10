"use client";

import { LogOut } from "lucide-react";
import { LogoutLink, useKindeBrowserClient } from "@kinde-oss/kinde-auth-nextjs";

import { cn } from "@/lib/utils";
import { ModeToggle } from "@/components/theme-toggle";
import WebhookDebugger from "./webhook-debugger";
import { SenderAvatar } from "./sender-avatar";

export default function SidebarFooter({ isCollapsed }: { isCollapsed: boolean }) {
  const { user } = useKindeBrowserClient();
  const name =
    [user?.given_name, user?.family_name].filter(Boolean).join(" ") ||
    user?.email ||
    "Account";

  return (
    <div
      className={cn(
        "flex items-center gap-2 border-t px-3 py-2.5",
        isCollapsed && "flex-col px-1",
      )}
    >
      <SenderAvatar name={name} email={user?.email} size={28} />
      {!isCollapsed && (
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-medium">{name}</p>
          {user?.email && (
            <p className="truncate text-[11px] text-muted-foreground">
              {user.email}
            </p>
          )}
        </div>
      )}
      <div className={cn("flex items-center gap-0.5", isCollapsed && "flex-col")}>
        {process.env.NODE_ENV === "development" && <WebhookDebugger />}
        <ModeToggle />
        <LogoutLink
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="size-4" />
        </LogoutLink>
      </div>
    </div>
  );
}
