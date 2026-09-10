import { useEffect, useRef } from "react";
import { DollarSign, Search, Sparkles } from "lucide-react";
import { APP_NAME } from "@/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { PrivacyBadge } from "@/components/layout/PrivacyBadge";
import { RefreshCountdown } from "@/components/layout/RefreshCountdown";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";

const titles: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: "Overview", subtitle: "This Mac" },
  apps: { title: "Apps", subtitle: "Running applications and local servers" },
  ports: { title: "Ports", subtitle: "Listening TCP services" },
  processes: { title: "Processes", subtitle: "Every process on this Mac" },
  projects: { title: "Projects", subtitle: "Git status for scanned folders" },
  docker: { title: "Docker", subtitle: "Containers, images, volumes, networks" },
  ai: { title: "AI Models", subtitle: "Local providers" },
  cache: { title: "Cache", subtitle: "User caches under your home folder" },
  brew: { title: "Homebrew", subtitle: "Outdated formulae and casks" },
  settings: { title: "Settings", subtitle: "FNode" },
};

export function TopBar() {
  const page = useAppStore((s) => s.page);
  const query = useAppStore((s) => s.query);
  const setQuery = useAppStore((s) => s.setQuery);
  const setAssistantOpen = useAppStore((s) => s.setAssistantOpen);
  const sidebarHidden = useAppStore((s) => s.sidebarHidden);
  const searchFocusAt = useAppStore((s) => s.searchFocusAt);
  const copy = titles[page];
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!searchFocusAt) return;
    searchRef.current?.focus();
    searchRef.current?.select();
  }, [searchFocusAt]);

  return (
    <header
      className={cn(
        "drag-region flex h-[52px] items-center justify-between border-b border-border px-4",
        sidebarHidden && "pl-[78px]",
      )}
      style={{ background: "var(--toolbar)" }}
    >
      <div className="min-w-0">
        <h1 className="text-[13px] font-semibold tracking-[-0.02em]">{copy.title}</h1>
        <p className="text-[11px] text-muted-foreground">{copy.subtitle}</p>
      </div>
      <div className="no-drag flex items-center gap-1.5">
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter"
            className="pl-7"
          />
        </div>
        <RefreshCountdown />
        <SpendBadge />
        <PrivacyBadge />
        <NotificationBell />
        <Button variant="secondary" onClick={() => setAssistantOpen(true)}>
          <Sparkles className="h-3.5 w-3.5" />
          Ask {APP_NAME}
        </Button>
      </div>
    </header>
  );
}

function SpendBadge() {
  const usage = useAppStore((s) => s.overview?.usage);
  if (!usage?.enabled) return null;
  return (
    <Badge
      variant="secondary"
      className="gap-1 px-1.5 py-0 text-[10px]"
      title={`${formatUsd(usage.todayUsd)} today · ${formatUsd(usage.monthUsd)} this month`}
    >
      <DollarSign className="h-3 w-3" />
      {formatUsd(usage.todayUsd)}
    </Badge>
  );
}
