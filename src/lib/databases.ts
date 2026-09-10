import { localhostUrl } from "@/lib/format";
import { api } from "@/services/tauri";

export type DbKind = "postgres" | "redis" | "mongodb";

export function dbKind(port: {
  port: number;
  processName?: string;
  displayName?: string;
  name?: string;
  software?: string;
}): DbKind | null {
  const name = `${port.processName ?? ""} ${port.displayName ?? ""} ${port.name ?? ""} ${port.software ?? ""}`.toLowerCase();
  if (name.includes("postgres") || name.includes("postmaster") || port.port === 5432) {
    return "postgres";
  }
  if (name.includes("redis") || port.port === 6379) {
    return "redis";
  }
  if (name.includes("mongo") || port.port === 27017) {
    return "mongodb";
  }
  return null;
}

export function dbLabel(kind: DbKind): string {
  if (kind === "postgres") return "Postgres";
  if (kind === "redis") return "Redis";
  return "MongoDB";
}

export function openListener(port: {
  port: number;
  address: string;
  processName?: string;
  displayName?: string;
  name?: string;
  software?: string;
}): Promise<void> {
  const kind = dbKind(port);
  if (kind) {
    return api.openDatabase(kind, port.port, port.address);
  }
  return api.openUrl(localhostUrl(port.port, port.address));
}
