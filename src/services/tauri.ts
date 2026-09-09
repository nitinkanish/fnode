import { invoke } from "@tauri-apps/api/core";
import type {
  AiService,
  AppSettings,
  AssistantReply,
  DockerOverview,
  LiveSnapshot,
  LogResult,
  Project,
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
  restartProcess: (pid: number) => invoke<number>("restart_process", { pid }),
  openTerminal: (path: string) => invoke<void>("open_terminal", { path }),
  openFolder: (path: string) => invoke<void>("open_folder", { path }),
  openInCursor: (path: string) => invoke<void>("open_in_cursor", { path }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),
  logs: (args: { pid?: number; cwd?: string; containerId?: string }) =>
    invoke<LogResult>("get_logs", args),
  ask: (question: string) => invoke<AssistantReply>("ask_assistant", { question }),
  settings: () => invoke<AppSettings>("get_settings"),
  saveSettings: (update: Record<string, unknown>) =>
    invoke<AppSettings>("save_settings", { update }),
};
