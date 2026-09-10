import type { AppNotice, LiveSnapshot } from "@/types";

const seen = new Set<string>();

export function ingestNotices(prev: LiveSnapshot | null, next: LiveSnapshot): AppNotice[] {
  const now = Date.now();
  const incoming: AppNotice[] = [];
  const first = prev === null;
  const health = next.health;
  const localhost = next.localhostApps ?? [];
  const groups = next.softwareGroups ?? [];
  const automation = next.automationAlerts ?? [];

  const active = new Set<string>();
  for (const alert of health?.alerts ?? []) {
    active.add(`health:${alert.id}`);
  }
  for (const app of localhost) {
    active.add(`local:${app.port}:${app.pid}`);
  }
  for (const group of groups) {
    if (group.cpu >= 55) active.add(`hot:${group.id}`);
  }
  for (const alert of automation) {
    active.add(`auto:${alert.id}`);
  }

  for (const key of [...seen]) {
    if (!active.has(key)) seen.delete(key);
  }

  for (const alert of health?.alerts ?? []) {
    const key = `health:${alert.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    incoming.push({
      id: `${key}:${now}`,
      severity: alert.severity === "critical" ? "critical" : "warning",
      title: alert.title,
      body: alert.body,
      ts: now,
    });
  }

  for (const app of localhost) {
    const key = `local:${app.port}:${app.pid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (first) continue;
    incoming.push({
      id: `${key}:${now}`,
      severity: "info",
      title: `New localhost:${app.port}`,
      body: `${app.name} is listening on ${app.address}:${app.port}.`,
      ts: now,
    });
  }

  for (const group of groups) {
    if (group.cpu < 55) continue;
    const key = `hot:${group.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (first) continue;
    incoming.push({
      id: `${key}:${now}`,
      severity: group.cpu >= 80 ? "critical" : "warning",
      title: `${group.name} is using high CPU`,
      body: `${group.name} is at ${group.cpu.toFixed(0)}% CPU across ${group.processCount} process${group.processCount === 1 ? "" : "es"}.`,
      ts: now,
    });
  }

  for (const alert of automation) {
    const key = `auto:${alert.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    incoming.push({
      id: `${key}:${now}`,
      severity: alert.severity === "critical" ? "critical" : alert.severity === "warning" ? "warning" : "info",
      title: alert.title,
      body: alert.body,
      ts: now,
      action: alert.action ?? undefined,
      pids: alert.pids,
    });
  }

  return incoming;
}
