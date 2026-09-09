import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { FolderOpen, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { compactGrid } from "@/components/shared/UsageRow";
import { APP_NAME } from "@/brand";
import { formatBytes, homeRelative } from "@/lib/format";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import type { CacheClearResult, CacheEntry, CacheGuide, CacheProgress } from "@/types";

export function CachePage() {
  const home = useAppStore((s) => s.settings?.paths.homeDir ?? s.overview?.paths.homeDir);
  const [guide, setGuide] = useState<CacheGuide | null>(null);
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [busy, setBusy] = useState<"scan" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<CacheEntry | null>(null);
  const [live, setLive] = useState<CacheProgress | null>(null);
  const [log, setLog] = useState<CacheProgress[]>([]);
  const [summary, setSummary] = useState<CacheClearResult | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api
      .cacheGuide()
      .then((info) => {
        setGuide(info);
        setEntries(info.categories);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    const pending = listen<CacheProgress>("cache-progress", (event) => {
      setLive(event.payload);
      setLog((rows) => [...rows.slice(-180), event.payload]);
    });
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [log]);

  async function scan() {
    setBusy("scan");
    setError(null);
    setSummary(null);
    setLog([]);
    setLive(null);
    try {
      setEntries(await api.inspectCaches());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function clearSelected() {
    if (!target) return;
    const entry = target;
    setTarget(null);
    setBusy("clear");
    setError(null);
    setSummary(null);
    setLog([]);
    setLive(null);
    try {
      const result = await api.clearCache(entry.id);
      setSummary(result);
      setEntries((rows) =>
        rows.map((row) =>
          row.id === result.id ? { ...row, bytes: 0, files: 0, scanned: true, exists: true } : row,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const scannedBytes = entries.filter((e) => e.scanned).reduce((sum, e) => sum + e.bytes, 0);
  const expected = busy === "clear" ? targetBytes(entries, live) : 0;
  const percent = expected > 0 ? Math.min(100, ((live?.bytes ?? 0) / expected) * 100) : busy ? 12 : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Home-only · no sudo · no /System
          {entries.some((e) => e.scanned) ? ` · ${formatBytes(scannedBytes)} measured` : ""}
        </p>
        <Button size="sm" variant="outline" className="h-7" disabled={Boolean(busy)} onClick={() => void scan()}>
          {busy === "scan" ? "Scanning…" : entries.some((e) => e.scanned) ? "Rescan" : "Scan caches"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {summary && (
        <p className="text-xs text-emerald-400">
          Cleared {summary.label}: {summary.files} files, {formatBytes(summary.bytes)} freed
          {summary.skipped ? ` · ${summary.skipped} skipped` : ""}.
        </p>
      )}

      <div className={compactGrid}>
        {entries.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="space-y-2 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium leading-tight">{entry.label}</div>
                  <p className="truncate font-mono text-[11px] text-muted-foreground" title={entry.path}>
                    {homeRelative(entry.path, home)}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm font-medium tabular-nums">
                  {entry.scanned && entry.exists ? formatBytes(entry.bytes) : "—"}
                </div>
              </div>
              <p className="line-clamp-2 text-[11px] text-muted-foreground">{entry.description}</p>
              <div className="flex flex-wrap gap-1">
                {!entry.exists && (
                  <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                    Not present
                  </Badge>
                )}
                {entry.scanned && entry.exists && (
                  <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                    {entry.files} files
                  </Badge>
                )}
                {entry.exists && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    disabled={Boolean(busy)}
                    onClick={() => void api.openFolder(entry.path)}
                  >
                    <FolderOpen className="h-3 w-3" />
                    Open
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 px-2"
                  disabled={!entry.exists || Boolean(busy) || (entry.scanned && entry.bytes === 0)}
                  onClick={() => setTarget(entry)}
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Live OS calls {busy ? `· ${busy}` : live?.done ? "· idle" : ""}
            </div>
            {busy ? (
              <Badge variant="warning">{busy === "scan" ? "Scanning" : "Clearing"}</Badge>
            ) : (
              <Badge variant="secondary">Idle</Badge>
            )}
          </div>
          <Progress value={busy ? Math.max(6, percent) : live?.done ? 100 : 0} />
          <p className="font-mono text-[11px] text-primary">{live ? `${live.syscall}(2)` : "waiting"}</p>
          <p className="truncate text-[11px] text-muted-foreground">{live?.message ?? guide?.summary ?? "Scan or clear to watch syscalls."}</p>
          <div className="h-36 overflow-y-auto rounded-md border border-border bg-background/80 p-2 font-mono text-[10px] leading-4">
            {log.length === 0 && <p className="text-muted-foreground">No syscalls yet.</p>}
            {log.map((row, index) => (
              <div key={`${row.syscall}-${index}-${row.path}`} className="truncate text-muted-foreground">
                <span className="text-primary">{row.syscall}</span> {row.message}
              </div>
            ))}
            <div ref={logEnd} />
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(target)}
        onOpenChange={(open) => !open && setTarget(null)}
        title={`Clear ${target?.label ?? "this cache"}?`}
        description={
          target
            ? `${APP_NAME} will readdir ${target.path}, then unlink files and rmdir empty folders inside it. The folder itself stays. Afterward: ${target.afterClear} This cannot be undone.`
            : ""
        }
        confirmLabel="Clear cache"
        onConfirm={() => void clearSelected()}
      />
    </div>
  );
}

function targetBytes(entries: CacheEntry[], live: CacheProgress | null): number {
  if (!live?.path) return 0;
  const match = entries.find((entry) => live.path.startsWith(entry.path) && entry.scanned && entry.bytes > 0);
  return match?.bytes ?? 0;
}
