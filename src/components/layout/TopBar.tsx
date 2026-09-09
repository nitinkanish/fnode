import { Search, Sparkles } from "lucide-react";
import { APP_NAME } from "@/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { RefreshCountdown } from "@/components/layout/RefreshCountdown";
import { useAppStore } from "@/store/appStore";

const titles: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: "System overview", subtitle: "Live machine health and running services" },
  apps: { title: "Applications", subtitle: "Running Mac apps and local servers — inspect, open, or quit" },
  ports: { title: "Port monitor", subtitle: "Listening TCP services on this Mac" },
  processes: { title: "All processes", subtitle: "Every process on this Mac, with app icon, runtime, and framework" },
  projects: { title: "Projects", subtitle: "Discovered from your usual code folders" },
  docker: { title: "Docker", subtitle: "Containers, images, volumes, and networks" },
  ai: { title: "AI models", subtitle: "Local providers detected on this machine" },
  cache: { title: "Cache cleaner", subtitle: "What FNode deletes, and live OS calls as it happens" },
  settings: { title: "Settings", subtitle: "App folders, privacy, scanning, and optional OpenAI" },
};

export function TopBar() {
  const page = useAppStore((s) => s.page);
  const query = useAppStore((s) => s.query);
  const setQuery = useAppStore((s) => s.setQuery);
  const setAssistantOpen = useAppStore((s) => s.setAssistantOpen);
  const copy = titles[page];

  return (
    <header className="drag-region flex h-14 items-center justify-between border-b border-border px-6">
      <div>
        <h1 className="text-sm font-semibold">{copy.title}</h1>
        <p className="text-xs text-muted-foreground">{copy.subtitle}</p>
      </div>
      <div className="no-drag flex items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter ports, processes, projects…"
            className="pl-8"
          />
        </div>
        <RefreshCountdown />
        <NotificationBell />
        <Button variant="outline" onClick={() => setAssistantOpen(true)}>
          <Sparkles className="h-4 w-4" />
          Ask {APP_NAME}
        </Button>
      </div>
    </header>
  );
}
