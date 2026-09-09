import { create } from "zustand";
import { api } from "@/services/tauri";
import type {
  AiService,
  AppSettings,
  DockerOverview,
  HistoryPoint,
  LiveSnapshot,
  PageId,
  PortInfo,
  DevProcess,
  Project,
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
  loading: boolean;
  error: string | null;
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
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
  loading: true,
  error: null,
  assistantOpen: false,
  setAssistantOpen: (assistantOpen) => set({ assistantOpen }),

  refreshLive: async () => {
    try {
      const snapshot = await api.live(get().page !== "processes");
      const memoryPct =
        snapshot.system.memoryTotal > 0
          ? (snapshot.system.memoryUsed / snapshot.system.memoryTotal) * 100
          : 0;
      const swapPct =
        snapshot.system.swapTotal > 0
          ? (snapshot.system.swapUsed / snapshot.system.swapTotal) * 100
          : 0;
      set((state) => ({
        overview: snapshot,
        ports: snapshot.ports,
        processes: snapshot.processes,
        loading: false,
        error: null,
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
