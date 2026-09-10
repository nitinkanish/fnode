import {
  Activity,
  AppWindow,
  Box,
  FolderGit2,
  LayoutDashboard,
  Package,
  Radio,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import { APP_NAME, APP_VERSION } from "@/brand";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";
import type { PageId } from "@/types";

const monitor: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "apps", label: "Apps", icon: AppWindow },
  { id: "ports", label: "Ports", icon: Radio },
  { id: "processes", label: "Processes", icon: Activity },
];

const workspace: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "projects", label: "Projects", icon: FolderGit2 },
  { id: "docker", label: "Docker", icon: Box },
  { id: "ai", label: "AI Models", icon: Sparkles },
  { id: "brew", label: "Homebrew", icon: Package },
];

export function Sidebar() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const overview = useAppStore((s) => s.overview);
  const hidden = useAppStore((s) => s.sidebarHidden);

  if (hidden) return null;

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar pt-[52px]">
      <div className="drag-region px-4 pb-3">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold tracking-[-0.02em]">{APP_NAME}</div>
            <p className="truncate text-[11px] text-muted-foreground">
              {overview?.system.hostname ?? "This Mac"} · v{APP_VERSION}
            </p>
          </div>
        </div>
      </div>
      <nav className="no-drag flex flex-1 flex-col gap-3 overflow-y-auto px-2.5">
        <NavGroup label="Monitor" items={monitor} page={page} onSelect={setPage} />
        <NavGroup label="Workspace" items={workspace} page={page} onSelect={setPage} />
        <div>
          <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            Maintenance
          </p>
          <NavButton
            id="cache"
            label="Cache"
            icon={Trash2}
            active={page === "cache"}
            onSelect={setPage}
          />
        </div>
      </nav>
      <div className="no-drag px-2.5 pb-3">
        <NavButton
          id="settings"
          label="Settings"
          icon={Settings}
          active={page === "settings"}
          onSelect={setPage}
        />
      </div>
    </aside>
  );
}

function NavGroup({
  label,
  items,
  page,
  onSelect,
}: {
  label: string;
  items: { id: PageId; label: string; icon: typeof LayoutDashboard }[];
  page: PageId;
  onSelect: (id: PageId) => void;
}) {
  return (
    <div>
      <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-col gap-px">
        {items.map((item) => (
          <NavButton
            key={item.id}
            id={item.id}
            label={item.label}
            icon={item.icon}
            active={page === item.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function NavButton({
  id,
  label,
  icon: Icon,
  active,
  onSelect,
}: {
  id: PageId;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  onSelect: (id: PageId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={cn(
        "flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[13px]",
        active ? "bg-sidebar-accent font-medium text-white" : "text-sidebar-foreground hover:bg-secondary",
      )}
    >
      <Icon className="h-3.5 w-3.5 opacity-80" />
      {label}
    </button>
  );
}
