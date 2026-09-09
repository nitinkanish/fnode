export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

export function formatPercent(value: number): string {
  return `${Math.max(0, value).toFixed(1)}%`;
}

export function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatStartedAt(epochSeconds: number): string {
  if (!epochSeconds) return "—";
  const date = new Date(epochSeconds * 1000);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function localhostUrl(port: number, address?: string): string {
  const raw = (address ?? "").replace(/^\[|\]$/g, "");
  const isWildcard = !raw || raw === "*" || raw === "::" || raw === "0.0.0.0" || raw === "::1";
  if (isWildcard) {
    return `http://127.0.0.1:${port}`;
  }
  const host = raw.includes(":") ? `[${raw}]` : raw;
  return `http://${host}:${port}`;
}

export function homeRelative(path: string, home?: string | null): string {
  if (home && path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

export function parentFolder(path: string): string {
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : path;
}

export function folderName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

export const chartTooltip = {
  background: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 8,
  fontSize: 12,
};
