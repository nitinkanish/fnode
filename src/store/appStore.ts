import { create } from "zustand";
import { ingestNotices } from "@/lib/notices";
import { api } from "@/services/tauri";
import type {
  AiService,
  AppNotice,
  AppSettings,
  AutomationRule,
  BrewOutdated,
  DockerOverview,
  HistoryPoint,
  LiveSnapshot,
  MetricsPoint,
  PageId,
  PortInfo,
  DevProcess,
  Project,
  SystemHealth,
} from "@/types";

export type SettingsTab = "general" | "costs" | "automations" | "about";

interface AppStore {
  page: PageId;
  setPage: (page: PageId) => void;
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  query: string;
  setQuery: (query: string) => void;
  sidebarHidden: boolean;
  toggleSidebar: () => void;
  searchFocusAt: number;
  focusSearch: () => void;
  overview: LiveSnapshot | null;
  ports: PortInfo[];
  processes: DevProcess[];
  projects: Project[];
  docker: DockerOverview | null;
  aiServices: AiService[];
  settings: AppSettings | null;
  automations: AutomationRule[];
  history: HistoryPoint[];
  metricsHistory: MetricsPoint[];
  metricsRange: "7d" | "30d";
  brew: BrewOutdated | null;
  notices: AppNotice[];
  unreadNotices: number;
  markNoticesRead: () => void;
  dismissNotice: (id: string) => void;
  clearNotices: () => void;
  loading: boolean;
  error: string | null;
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  lastLiveAt: number | null;
  refreshLive: () => Promise<void>;
  refreshProjects: (scan?: boolean) => Promise<void>;
  refreshDocker: () => Promise<void>;
  refreshAi: () => Promise<void>;
  loadSettings: () => Promise<void>;
  loadAutomations: () => Promise<void>;
  saveAutomation: (rule: AutomationRule) => Promise<void>;
  deleteAutomation: (id: number) => Promise<void>;
  refreshUsage: () => Promise<void>;
  loadMetrics: (range?: "7d" | "30d") => Promise<void>;
  refreshBrew: (force?: boolean) => Promise<void>;
}

export const useAppStore = create<AppStore>((set, get) => ({
  page: "dashboard",
  setPage: (page) => set({ page }),
  settingsTab: "general",
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  query: "",
  setQuery: (query) => set({ query }),
  sidebarHidden: false,
  toggleSidebar: () => set((state) => ({ sidebarHidden: !state.sidebarHidden })),
  searchFocusAt: 0,
  focusSearch: () => set({ searchFocusAt: Date.now() }),
  overview: null,
  ports: [],
  processes: [],
  projects: [],
  docker: null,
  aiServices: [],
  settings: null,
  automations: [],
  history: [],
  metricsHistory: [],
  metricsRange: "7d",
  brew: null,
  notices: [],
  unreadNotices: 0,
  markNoticesRead: () => set({ unreadNotices: 0 }),
  dismissNotice: (id) =>
    set((state) => ({ notices: state.notices.filter((notice) => notice.id !== id) })),
  clearNotices: () => set({ notices: [], unreadNotices: 0 }),
  loading: true,
  error: null,
  assistantOpen: false,
  setAssistantOpen: (assistantOpen) => set({ assistantOpen }),

  lastLiveAt: null,
  refreshLive: async () => {
    try {
      const snapshot = normalizeSnapshot(await api.live(get().page !== "processes"));
      const memoryPct =
        snapshot.system.memoryTotal > 0
          ? (snapshot.system.memoryUsed / snapshot.system.memoryTotal) * 100
          : 0;
      const swapPct =
        snapshot.system.swapTotal > 0
          ? (snapshot.system.swapUsed / snapshot.system.swapTotal) * 100
          : 0;
      const incoming = ingestNotices(get().overview, snapshot);
      set((state) => ({
        overview: snapshot,
        ports: snapshot.ports,
        processes: snapshot.processes,
        loading: false,
        error: null,
        lastLiveAt: Date.now(),
        notices: incoming.length ? [...incoming, ...state.notices].slice(0, 40) : state.notices,
        unreadNotices: state.unreadNotices + incoming.length,
        history: [
          ...state.history.slice(-39),
          {
            ts: Date.now(),
            cpu: snapshot.system.cpuUsage,
            memory: memoryPct,
            swap: swapPct,
            load: snapshot.system.loadAvg1,
            rx: snapshot.system.networkRxPerSec,
            tx: snapshot.system.networkTxPerSec,
          },
        ],
      }));
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  refreshProjects: async (scan = false) => {
    try {
      const projects = (scan ? await api.scanProjects() : await api.projects()).map(normalizeProject);
      set({ projects });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  refreshDocker: async () => {
    try {
      const docker = await api.docker();
      set({ docker });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  refreshAi: async () => {
    try {
      const aiServices = await api.aiServices();
      set({ aiServices });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  loadSettings: async () => {
    try {
      const settings = await api.settings();
      set({ settings });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  loadAutomations: async () => {
    try {
      const automations = await api.listAutomations();
      set({ automations });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  saveAutomation: async (rule) => {
    const automations = await api.saveAutomation(rule);
    set({ automations });
  },

  deleteAutomation: async (id) => {
    const automations = await api.deleteAutomation(id);
    set({ automations });
  },

  refreshUsage: async () => {
    const usage = await api.refreshUsage();
    set((state) => ({
      overview: state.overview ? { ...state.overview, usage } : state.overview,
    }));
  },

  loadMetrics: async (range) => {
    const next = range ?? get().metricsRange;
    try {
      const metricsHistory = await api.metricsHistory(next);
      set({ metricsHistory, metricsRange: next });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  refreshBrew: async (force = false) => {
    try {
      const brew = await api.brewOutdated(force);
      set({ brew });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },
}));

function fallbackHealth(snapshot: LiveSnapshot): SystemHealth {
  const memoryPct =
    snapshot.system.memoryTotal > 0
      ? (snapshot.system.memoryUsed / snapshot.system.memoryTotal) * 100
      : 0;
  const diskPct =
    snapshot.system.diskTotal > 0
      ? (snapshot.system.diskUsed / snapshot.system.diskTotal) * 100
      : 0;
  return {
    score: 100,
    status: "healthy",
    temperatureC: snapshot.system.temperatureC ?? null,
    cpuSpeedLimit: null,
    cpuPct: snapshot.system.cpuUsage,
    memoryPct,
    diskPct,
    loadRatio: snapshot.system.cpuCores ? snapshot.system.loadAvg1 / snapshot.system.cpuCores : 0,
    alerts: [],
  };
}

function normalizeSnapshot(snapshot: LiveSnapshot): LiveSnapshot {
  return {
    ...snapshot,
    softwareGroups: (snapshot.softwareGroups ?? []).map((app) => ({
      ...app,
      bundlePath: app.bundlePath ?? null,
      startedAt: app.startedAt ?? 0,
      helpers: app.helpers ?? [],
    })),
    guiApps: (snapshot.guiApps ?? []).map((app) => ({
      ...app,
      bundlePath: app.bundlePath ?? null,
      startedAt: app.startedAt ?? 0,
      helpers: app.helpers ?? [],
    })),
    localhostApps: (snapshot.localhostApps ?? []).map((app) => ({
      ...app,
      startedAt: app.startedAt ?? 0,
    })),
    health: snapshot.health ?? fallbackHealth(snapshot),
    privacy: snapshot.privacy ?? {
      cameraActive: false,
      microphoneActive: false,
      cameraApps: [],
      microphoneApps: [],
    },
    battery: snapshot.battery ?? {
      present: false,
      percent: null,
      cycleCount: null,
      designCapacity: null,
      maxCapacity: null,
      maxCapacityPct: null,
      condition: "Unknown",
      charging: false,
      drainers: [],
    },
    usage: snapshot.usage ?? {
      enabled: false,
      todayUsd: 0,
      monthUsd: 0,
      todayTokens: 0,
      monthTokens: 0,
    },
    automationAlerts: snapshot.automationAlerts ?? [],
    processes: (snapshot.processes ?? []).map((proc) => ({
      ...proc,
      software: proc.software || proc.displayName || proc.name,
      icon: proc.icon ?? null,
    })),
  };
}

function normalizeProject(project: Project): Project {
  return {
    ...project,
    gitDirty: project.gitDirty ?? 0,
    gitAhead: project.gitAhead ?? 0,
    gitBehind: project.gitBehind ?? 0,
    gitHasRemote: project.gitHasRemote ?? false,
  };
}
