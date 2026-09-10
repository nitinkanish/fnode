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
  temperatureC: number | null;
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
  softwareGroups: SoftwareGroup[];
  guiApps: SoftwareGroup[];
  localhostApps: LocalhostApp[];
  health: SystemHealth;
  privacy: PrivacyStatus;
  battery: BatteryStatus;
  paths: AppPaths;
}

export type DashboardOverview = LiveSnapshot;

export interface PrivacyApp {
  pid: number;
  name: string;
  software: string;
  icon: string | null;
}

export interface PrivacyStatus {
  cameraActive: boolean;
  microphoneActive: boolean;
  cameraApps: PrivacyApp[];
  microphoneApps: PrivacyApp[];
}

export interface BatteryDrainer {
  name: string;
  cpu: number;
  memoryBytes: number;
  icon: string | null;
}

export interface BatteryStatus {
  present: boolean;
  percent: number | null;
  cycleCount: number | null;
  designCapacity: number | null;
  maxCapacity: number | null;
  maxCapacityPct: number | null;
  condition: string;
  charging: boolean;
  drainers: BatteryDrainer[];
}

export interface MetricsPoint {
  ts: number;
  cpu: number;
  memory: number;
  swap: number;
  disk: number;
  rx: number;
  tx: number;
}

export interface BrewPackage {
  name: string;
  current: string;
  latest: string;
  pinned: boolean;
  cask: boolean;
}

export interface BrewOutdated {
  available: boolean;
  error: string | null;
  formulae: BrewPackage[];
  casks: BrewPackage[];
}

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
  software: string;
  icon: string | null;
}

export interface SoftwareGroup {
  id: string;
  name: string;
  kind: string;
  cpu: number;
  memoryBytes: number;
  processCount: number;
  pids: number[];
  ports: number[];
  canStop: boolean;
  icon: string | null;
  frameworks: string[];
  runtimes: string[];
  bundlePath: string | null;
  startedAt: number;
  helpers: string[];
}

export interface LocalhostApp {
  pid: number;
  name: string;
  software: string;
  port: number;
  address: string;
  cpu: number;
  memoryBytes: number;
  cwd: string | null;
  canStop: boolean;
  framework: string | null;
  runtime: string | null;
  icon: string | null;
  project: string | null;
  startedAt: number;
}

export interface HealthAlert {
  id: string;
  severity: string;
  title: string;
  body: string;
}

export interface SystemHealth {
  score: number;
  status: string;
  temperatureC: number | null;
  cpuSpeedLimit: number | null;
  cpuPct: number;
  memoryPct: number;
  diskPct: number;
  loadRatio: number;
  alerts: HealthAlert[];
}

export interface CacheEntry {
  id: string;
  label: string;
  description: string;
  afterClear: string;
  path: string;
  bytes: number;
  files: number;
  exists: boolean;
  scanned: boolean;
}

export interface CacheSyscall {
  name: string;
  purpose: string;
}

export interface CacheGuide {
  title: string;
  summary: string;
  does: string[];
  never: string[];
  syscalls: CacheSyscall[];
  categories: CacheEntry[];
}

export interface CacheProgress {
  job: string;
  phase: string;
  syscall: string;
  path: string;
  message: string;
  bytes: number;
  files: number;
  skipped: number;
  done: boolean;
}

export interface CacheClearResult {
  id: string;
  label: string;
  path: string;
  bytes: number;
  files: number;
  dirs: number;
  skipped: number;
}

export interface AppNotice {
  id: string;
  severity: "warning" | "critical" | "info";
  title: string;
  body: string;
  ts: number;
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
  family: string | null;
  quantization: string | null;
  format: string | null;
  loaded: boolean;
}

export interface AiService {
  provider: string;
  running: boolean;
  endpoint: string | null;
  models: AiModel[];
  pid: number | null;
  loadedCount: number;
  version: string | null;
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
  privacySensorsEnabled: boolean;
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
  disk?: number;
  [key: string]: number | undefined;
}

export type PageId =
  | "dashboard"
  | "apps"
  | "ports"
  | "processes"
  | "projects"
  | "docker"
  | "ai"
  | "cache"
  | "brew"
  | "settings";
