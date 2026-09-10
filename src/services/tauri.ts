import { invoke } from "@tauri-apps/api/core";
import type {
  AiService,
  AppSettings,
  AssistantReply,
  AutomationRule,
  BrewOutdated,
  CacheClearResult,
  CacheEntry,
  CacheGuide,
  DockerOverview,
  LiveSnapshot,
  LogResult,
  MetricsPoint,
  Project,
  UsageSummary,
} from "@/types";

export const api = {
  live: (developerOnly = true) =>
    invoke<LiveSnapshot>("get_live_snapshot", { developerOnly }),
  projects: () => invoke<Project[]>("get_projects"),
  scanProjects: () => invoke<Project[]>("scan_projects"),
  docker: () => invoke<DockerOverview>("get_docker_overview"),
  dockerStart: (id: string) => invoke<void>("docker_start", { id }),
  dockerStop: (id: string) => invoke<void>("docker_stop", { id }),
  dockerRestart: (id: string) => invoke<void>("docker_restart", { id }),
  dockerLogs: (id: string) => invoke<LogResult>("docker_logs", { id }),
  dockerShell: (name: string) => invoke<void>("docker_open_shell", { name }),
  aiServices: () => invoke<AiService[]>("detect_ai_services"),
  aiStart: (provider: string) => invoke<void>("ai_start", { provider }),
  aiStop: (pid: number) => invoke<void>("ai_stop", { pid }),
  aiChat: (provider: string, endpoint?: string | null) =>
    invoke<void>("ai_open_chat", { provider, endpoint }),
  killProcess: (pid: number, force = false) =>
    invoke<void>("kill_process", { pid, force }),
  killProcesses: (pids: number[], force = false) =>
    invoke<number>("kill_processes", { pids, force }),
  quitCompletely: async (pids: number[]) => {
    const unique = [...new Set(pids.filter((pid) => pid > 1))];
    if (unique.length === 0) return 0;
    const first = await invoke<number>("kill_processes", { pids: unique, force: false });
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    await invoke<number>("kill_processes", { pids: unique, force: true }).catch(() => 0);
    return first;
  },
  inspectCaches: () => invoke<CacheEntry[]>("inspect_caches"),
  cacheGuide: () => invoke<CacheGuide>("get_cache_guide"),
  clearCache: (id: string) => invoke<CacheClearResult>("clear_cache", { id }),
  restartProcess: (pid: number) => invoke<number>("restart_process", { pid }),
  openTerminal: (path: string) => invoke<void>("open_terminal", { path }),
  openFolder: (path: string) => invoke<void>("open_folder", { path }),
  openInCursor: (path: string) => invoke<void>("open_in_cursor", { path }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),
  openHomepage: () => invoke<void>("open_homepage"),
  logs: (args: { pid?: number; cwd?: string; containerId?: string }) =>
    invoke<LogResult>("get_logs", args),
  ask: (question: string) => invoke<AssistantReply>("ask_assistant", { question }),
  settings: () => invoke<AppSettings>("get_settings"),
  saveSettings: (update: Record<string, unknown>) =>
    invoke<AppSettings>("save_settings", { update }),
  metricsHistory: (range: "7d" | "30d") =>
    invoke<MetricsPoint[]>("get_metrics_history", { range }),
  brewOutdated: (force = false) => invoke<BrewOutdated>("get_brew_outdated", { force }),
  brewUpgrade: (name: string) => invoke<string>("brew_upgrade", { name }),
  openDatabase: (kind: string, port: number, address: string) =>
    invoke<void>("open_database", { kind, port, address }),
  listAutomations: () => invoke<AutomationRule[]>("list_automations"),
  saveAutomation: (rule: AutomationRule) => invoke<AutomationRule[]>("save_automation", { rule }),
  deleteAutomation: (id: number) => invoke<AutomationRule[]>("delete_automation", { id }),
  refreshUsage: () => invoke<UsageSummary>("refresh_usage"),
};
