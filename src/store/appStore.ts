import { create } from "zustand";
import { ingestNotices } from "@/lib/notices";
import { api } from "@/services/tauri";
import type {
  AiService,
  AppNotice,
  AppSettings,
  DockerOverview,
  HistoryPoint,
  LiveSnapshot,
  PageId,
  PortInfo,
  DevProcess,
  Project,
  SystemHealth,
} from "@/types";

interface AppStore {
  page: PageId;
  setPage: (page: PageId) => void;
  query: string;
  setQuery: (query: string) => void;
  overview: LiveSnapshot | null;
  ports: PortInfo[];
  processes: DevProcess[];
  projects: Project[];
  docker: DockerOverview | null;
  aiServices: AiService[];
  settings: AppSettings | null;
  history: HistoryPoint[];
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
}

export const useAppStore = create<AppStore>((set, get) => ({
  page: "dashboard",
  setPage: (page) => set({ page }),
  query: "",
  setQuery: (query) => set({ query }),
  overview: null,
  ports: [],
  processes: [],
  projects: [],
  docker: null,
  aiServices: [],
  settings: null,
  history: [],
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
      const projects = scan ? await api.scanProjects() : await api.projects();
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
    processes: (snapshot.processes ?? []).map((proc) => ({
      ...proc,
      software: proc.software || proc.displayName || proc.name,
      icon: proc.icon ?? null,
    })),
  };
}
