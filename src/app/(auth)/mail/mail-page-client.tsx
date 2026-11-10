"use client";

import TopAccountSwitcher from "./top-account-switcher";
import MailClient from "@/app/mail/mail-client";
import Kbar from "@/app/mail/components/kbar";

interface MailPageClientProps {
  defaultLayout: number[] | undefined;
  defaultCollapsed?: boolean;
  navCollapsedSize: number;
}

export default function MailPageClient({
  defaultLayout,
  defaultCollapsed,
  navCollapsedSize,
}: MailPageClientProps) {
  return (
    <Kbar>
      {/* <div className="border-b ">
        <TopAccountSwitcher />
      </div> */}
      <MailClient
        defaultLayout={defaultLayout}
        defaultCollapsed={defaultCollapsed}
        navCollapsedSize={navCollapsedSize}
      />
    </Kbar>
  );
}
