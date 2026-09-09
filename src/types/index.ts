export interface SystemSnapshot {
  hostname: string;
  osName: string;
  osVersion: string;
  cpuBrand: string;
  cpuCores: number;
  cpuUsage: number;
  memoryUsed: number;
  memoryTotal: number;
  swapUsed: number;
  swapTotal: number;
  diskUsed: number;
  diskTotal: number;
  diskMount: string;
  processCount: number;
  uptimeSeconds: number;
  loadAvg1: number;
  loadAvg5: number;
  loadAvg15: number;
  cpuPerCore: number[];
  arch: string;
  kernel: string;
  networkRxBytes: number;
  networkTxBytes: number;
  networkRxPerSec: number;
  networkTxPerSec: number;
}

export interface ChartProc {
  pid: number;
  name: string;
  cpu: number;
  memoryBytes: number;
}

export interface AppPaths {
  dataDir: string;
  database: string;
  logsDir: string;
  homeDir: string;
  executable: string | null;
}

export interface PortInfo {
  port: number;
  protocol: string;
  address: string;
  pid: number;
  processName: string;
  displayName: string;
  command: string;
  cpu: number;
  memoryBytes: number;
  projectName: string | null;
  projectPath: string | null;
  cwd: string | null;
}

export interface LiveSnapshot {
  system: SystemSnapshot;
  openPorts: number;
  dockerContainers: number;
  dockerRunning: number;
  dockerAvailable: boolean;
  aiServices: number;
  projectCount: number;
  topPorts: PortInfo[];
  ports: PortInfo[];
  processes: DevProcess[];
  topCpu: ChartProc[];
  topMemory: ChartProc[];
  paths: AppPaths;
}

export type DashboardOverview = LiveSnapshot;

export interface EnvVar {
  key: string;
  value: string;
}

export interface DevProcess {
  pid: number;
  parentPid: number | null;
  name: string;
  displayName: string;
  framework: string | null;
  runtime: string | null;
  command: string;
  cwd: string | null;
  cpu: number;
  memoryBytes: number;
  startedAt: number;
  ports: number[];
  isDevService: boolean;
  safeEnv: EnvVar[];
  exe: string | null;
  status: string;
}

export interface Project {
  id: number;
  name: string;
  path: string;
  framework: string | null;
  language: string | null;
  gitBranch: string | null;
  lastModified: string | null;
  createdAt: string;
  isRunning: boolean;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string[];
  created: number;
}

export interface DockerImage {
  id: string;
  tags: string[];
  size: number;
  created: number;
}

export interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
}

export interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
}

export interface DockerOverview {
  available: boolean;
  error: string | null;
  containers: DockerContainer[];
  images: DockerImage[];
  volumes: DockerVolume[];
  networks: DockerNetwork[];
}

export interface AiModel {
  name: string;
  size: string | null;
  parameterSize: string | null;
}

export interface AiService {
  provider: string;
  running: boolean;
  endpoint: string | null;
  models: AiModel[];
  pid: number | null;
}

export interface LogResult {
  source: string;
  title: string;
  lines: string[];
}

export interface AssistantReply {
  answer: string;
  localOnly: boolean;
  citations: string[];
}

export interface AppSettings {
  openaiEnabled: boolean;
  openaiModel: string;
  pollIntervalMs: number;
  projectRoots: string[];
  hasOpenaiKey: boolean;
  paths: AppPaths;
}

export interface HistoryPoint {
  ts: number;
  cpu: number;
  memory: number;
  swap: number;
  load: number;
  rx: number;
  tx: number;
}

export type PageId =
  | "dashboard"
  | "ports"
  | "processes"
  | "projects"
  | "docker"
  | "ai"
  | "settings";
