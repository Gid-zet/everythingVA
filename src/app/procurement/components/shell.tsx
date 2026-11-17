"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BookOpen, Building2, LayoutDashboard, Mail, Menu, Search, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

const NAV = [
  { href: "/procurement", label: "Dashboard", icon: LayoutDashboard, exact: true, tone: "from-indigo-500 to-violet-600" },
  { href: "/procurement/opportunities", label: "Opportunities", icon: Search, tone: "from-sky-500 to-cyan-600" },
  { href: "/procurement/profile", label: "Company profile", icon: Building2, tone: "from-emerald-500 to-teal-600" },
  { href: "/procurement/knowledge", label: "Knowledge base", icon: BookOpen, tone: "from-violet-500 to-fuchsia-600" },
  { href: "/procurement/activity", label: "Activity log", icon: Activity, tone: "from-orange-500 to-pink-600" },
  { href: "/procurement/settings", label: "Sources & team", icon: Settings, tone: "from-rose-500 to-orange-500" },
];

export function ProcurementShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const { data } = api.procurement.overview.useQuery(undefined, { staleTime: 30_000 });
  React.useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav className="flex flex-col gap-0.5 p-3">
      {NAV.map(({ href, label, icon: Icon, exact, tone }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-background font-medium text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            <span className={cn("flex size-6 items-center justify-center rounded-md bg-gradient-to-br text-white shadow-sm transition-opacity", tone, !active && "opacity-80")}>
              <Icon className="size-3.5" />
            </span>
            {label}
          </Link>
        );
      })}
      <div className="my-2 h-px bg-border" />
      <Link href="/mail" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
        <Mail className="size-4" />
        Back to mail
      </Link>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 border-r bg-sidebar md:block">
        <div className="sticky top-0">
          <div className="border-b px-5 py-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Procurement</p>
            <p className="mt-0.5 truncate text-sm font-semibold">{data?.workspace.name ?? "…"}</p>
          </div>
          {nav}
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r bg-sidebar">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <p className="truncate text-sm font-semibold">{data?.workspace.name ?? "Procurement"}</p>
              <button onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="size-4" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <div className="flex items-center gap-2 border-b px-4 py-3 md:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-md p-1.5 hover:bg-muted">
            <Menu className="size-5" />
          </button>
          <span className="text-sm font-semibold">Procurement</span>
        </div>
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
