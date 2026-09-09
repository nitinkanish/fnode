import {
  Activity,
  Box,
  FolderGit2,
  LayoutDashboard,
  Radio,
  Settings,
  Sparkles,
} from "lucide-react";
import { APP_AUTHOR, APP_NAME, APP_TAGLINE } from "@/brand";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";
import type { PageId } from "@/types";

const items: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "ports", label: "Ports", icon: Radio },
  { id: "processes", label: "Processes", icon: Activity },
  { id: "projects", label: "Projects", icon: FolderGit2 },
  { id: "docker", label: "Docker", icon: Box },
  { id: "ai", label: "AI Models", icon: Sparkles },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const overview = useAppStore((s) => s.overview);

  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar pt-11">
      <div className="drag-region px-5 pb-5">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt={APP_NAME}
            className="h-9 w-9 object-contain"
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight">{APP_NAME}</div>
            <p className="text-[10px] leading-snug text-muted-foreground">{APP_TAGLINE}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          {overview?.system.hostname ?? "This Mac"}
        </div>
      </div>
      <nav className="no-drag flex flex-1 flex-col gap-0.5 px-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active = page === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="no-drag px-4 pb-4 text-[11px] leading-snug text-muted-foreground">
        <div>By {APP_AUTHOR}</div>
        <div className="mt-1">Local-first · nothing leaves this Mac</div>
      </div>
    </aside>
  );
}
