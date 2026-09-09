import { useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePolling } from "@/hooks/usePolling";
import { useAppStore } from "@/store/appStore";
import { DashboardPage } from "@/pages/DashboardPage";
import { PortsPage } from "@/pages/PortsPage";
import { ProcessesPage } from "@/pages/ProcessesPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { DockerPage } from "@/pages/DockerPage";
import { AiModelsPage } from "@/pages/AiModelsPage";
import { SettingsPage } from "@/pages/SettingsPage";

export function AppShell() {
  const page = useAppStore((s) => s.page);
  const refreshLive = useAppStore((s) => s.refreshLive);
  const refreshProjects = useAppStore((s) => s.refreshProjects);
  const refreshDocker = useAppStore((s) => s.refreshDocker);
  const refreshAi = useAppStore((s) => s.refreshAi);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const pollMs = useAppStore((s) => s.settings?.pollIntervalMs ?? 3000);
  const error = useAppStore((s) => s.error);

  const live = useCallback(() => refreshLive(), [refreshLive]);
  usePolling(live, pollMs, true);

  const slower = useCallback(() => {
    void refreshProjects();
    void refreshDocker();
    void refreshAi();
    void loadSettings();
  }, [refreshProjects, refreshDocker, refreshAi, loadSettings]);
  usePolling(slower, Math.max(pollMs * 4, 12000), true);

  return (
    <div className="flex h-full bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {error && (
          <div className="no-drag border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <ScrollArea className="flex-1">
          <main className="p-6">
            {page === "dashboard" && <DashboardPage />}
            {page === "ports" && <PortsPage />}
            {page === "processes" && <ProcessesPage />}
            {page === "projects" && <ProjectsPage />}
            {page === "docker" && <DockerPage />}
            {page === "ai" && <AiModelsPage />}
            {page === "settings" && <SettingsPage />}
          </main>
        </ScrollArea>
      </div>
      <AssistantPanel />
    </div>
  );
}
