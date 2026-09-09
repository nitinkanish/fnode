import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { FolderOpen, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { APP_NAME } from "@/brand";
import { formatBytes } from "@/lib/format";
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
          row.id === result.id
            ? { ...row, bytes: 0, files: 0, scanned: true, exists: true }
            : row,
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
  const percent =
    expected > 0 ? Math.min(100, ((live?.bytes ?? 0) / expected) * 100) : busy ? 12 : 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{guide?.title ?? "User cache cleaner"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>{guide?.summary}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <FactList title="What a clear actually does" items={guide?.does ?? []} tone="do" />
              <FactList title="What it will never do" items={guide?.never ?? []} tone="never" />
            </div>
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground">
                OS calls {APP_NAME} uses
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(guide?.syscalls ?? []).map((call) => (
                  <div key={call.name} className="rounded-lg bg-secondary/60 px-3 py-2">
                    <div className="font-mono text-xs text-primary">{call.name}(2)</div>
                    <p className="mt-0.5 text-xs">{call.purpose}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Cache locations</CardTitle>
            <Button variant="outline" disabled={Boolean(busy)} onClick={() => void scan()}>
              {busy === "scan" ? "Scanning…" : entries.some((e) => e.scanned) ? "Rescan" : "Scan caches"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Scan measures size with <span className="font-mono">stat</span>. Clear then deletes
              only that folder’s contents. All paths stay under {home ?? "your home directory"}.
            </p>
            {entries.some((e) => e.scanned) && (
              <p className="text-sm">
                Measured <span className="font-medium text-foreground">{formatBytes(scannedBytes)}</span> of
                disposable files.
              </p>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
            {summary && (
              <p className="text-xs text-emerald-400">
                Cleared {summary.label}: {summary.files} files, {summary.dirs} folders,{" "}
                {formatBytes(summary.bytes)} freed
                {summary.skipped ? ` · ${summary.skipped} skipped` : ""}.
              </p>
            )}
            <div className="overflow-hidden rounded-xl border border-border">
              {entries.map((entry) => (
                <div key={entry.id} className="border-b border-border/70 px-3 py-3 last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{entry.label}</span>
                        {!entry.exists && <Badge variant="secondary">Not present</Badge>}
                        {entry.scanned && entry.exists && (
                          <Badge variant="secondary">{entry.files} files</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{entry.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        After clear: {entry.afterClear}
                      </p>
                      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{entry.path}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-medium">
                        {entry.scanned && entry.exists ? formatBytes(entry.bytes) : "—"}
                      </div>
                      <div className="mt-2 flex justify-end gap-2">
                        {entry.exists && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={Boolean(busy)}
                            onClick={() => void api.openFolder(entry.path)}
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            Open
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={!entry.exists || Boolean(busy) || (entry.scanned && entry.bytes === 0)}
                          onClick={() => setTarget(entry)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Clear cache
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-0">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Live OS interaction</CardTitle>
            {busy ? (
              <Badge variant="warning">{busy === "scan" ? "Scanning" : "Clearing"}</Badge>
            ) : live?.done ? (
              <Badge variant="success">Idle</Badge>
            ) : (
              <Badge variant="secondary">Idle</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Home-only · no sudo · no /System
            </div>
            <Progress value={busy ? Math.max(6, percent) : live?.done ? 100 : 0} />
            <div className="rounded-lg bg-secondary/60 px-3 py-2">
              <div className="font-mono text-xs text-primary">
                {live ? `${live.syscall}(2)` : "waiting"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{live?.message ?? "Start a scan or clear to watch syscalls."}</p>
              {live?.path && (
                <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{live.path}</p>
              )}
              {(live?.files ?? 0) > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {live?.files} files · {formatBytes(live?.bytes ?? 0)}
                  {live?.skipped ? ` · ${live.skipped} skipped` : ""}
                </p>
              )}
            </div>
            <div className="h-[420px] overflow-y-auto rounded-lg border border-border bg-background/80 p-3 font-mono text-[11px] leading-5">
              {log.length === 0 && (
                <p className="text-muted-foreground">
                  {busy ? "Talking to the file system…" : "No syscalls yet."}
                </p>
              )}
              {log.map((row, index) => (
                <div key={`${row.syscall}-${index}-${row.path}`} className="text-muted-foreground">
                  <span className="text-primary">{row.syscall}</span>
                  <span className="text-zinc-500">  {row.phase}</span>
                  <div className="truncate text-foreground/80">{row.message}</div>
                </div>
              ))}
              <div ref={logEnd} />
            </div>
          </CardContent>
        </Card>
      </div>

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

function FactList({ title, items, tone }: { title: string; items: string[]; tone: "do" | "never" }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground">{title}</div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs">
            <span className={tone === "do" ? "text-emerald-400" : "text-amber-400"}>•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function targetBytes(entries: CacheEntry[], live: CacheProgress | null): number {
  if (!live?.path) return 0;
  const match = entries.find((entry) => live.path.startsWith(entry.path) && entry.scanned && entry.bytes > 0);
  return match?.bytes ?? 0;
}
