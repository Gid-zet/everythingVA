"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLocalStorage } from "usehooks-ts";
import { useRouter } from "next/navigation";

export interface NavLink {
  title: string;
  /** Value stored in the tab key; defaults to the lowercased title. */
  tab?: string;
  label?: string;
  icon: LucideIcon;
  active: boolean;
  href?: string;
}

interface NavProps {
  isCollapsed: boolean;
  links: NavLink[];
  heading?: string;
}

export function Nav({ links, isCollapsed, heading }: NavProps) {
  const [, setTab] = useLocalStorage("normalhuman-tab", "inbox");
  const router = useRouter();

  return (
    <div data-collapsed={isCollapsed} className="group flex flex-col py-1">
      {heading && !isCollapsed && (
        <p className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          {heading}
        </p>
      )}
      <nav className="grid gap-0.5 px-2 group-[[data-collapsed=true]]:justify-center">
        {links.map((link) => {
          const handleClick = () => {
            if (link.href) router.push(link.href);
            else setTab(link.tab ?? link.title.toLowerCase());
          };

          const base = cn(
            "relative flex items-center rounded-lg text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            link.active
              ? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_hsl(var(--border))]"
              : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
          );

          if (isCollapsed) {
            return (
              <Tooltip key={link.title} delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleClick}
                    aria-label={link.title}
                    aria-current={link.active ? "page" : undefined}
                    className={cn(base, "size-9 justify-center")}
                  >
                    <link.icon
                      className={cn("size-4", link.active && "text-brand")}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="flex items-center gap-3">
                  {link.title}
                  {link.label && (
                    <span className="text-muted-foreground">{link.label}</span>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          }

          return (
            <button
              key={link.title}
              onClick={handleClick}
              aria-current={link.active ? "page" : undefined}
              className={cn(base, "h-8 gap-2.5 px-2.5")}
            >
              <link.icon
                className={cn("size-4 shrink-0", link.active && "text-brand")}
              />
              <span className="truncate">{link.title}</span>
              {link.label && (
                <span
                  className={cn(
                    "ml-auto rounded-md px-1.5 text-[11px] tabular-nums",
                    link.active
                      ? "bg-brand-soft text-brand"
                      : "text-muted-foreground/80",
                  )}
                >
                  {link.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
