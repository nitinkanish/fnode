import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/services/tauri";
import type { LogResult } from "@/types";

interface LogViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logs: LogResult | null;
  follow?: { pid?: number; cwd?: string; containerId?: string };
}

export function LogViewer({ open, onOpenChange, logs, follow }: LogViewerProps) {
  const [live, setLive] = useState<LogResult | null>(logs);

  useEffect(() => {
    setLive(logs);
  }, [logs]);

  useEffect(() => {
    if (!open || !follow) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await api.logs(follow);
        if (!cancelled) setLive(next);
      } catch {
        /* keep last lines */
      }
    };
    const id = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open, follow?.pid, follow?.cwd, follow?.containerId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{live?.title ?? logs?.title ?? "Logs"}</DialogTitle>
        </DialogHeader>
        {follow && (
          <p className="text-[11px] text-muted-foreground">
            Following this log every 2s. The rest of FNode still uses the slow snapshot timer.
          </p>
        )}
        <ScrollArea className="h-[420px] rounded-lg border border-border bg-black/40">
          <pre className="whitespace-pre-wrap p-4 font-mono text-xs leading-5 text-zinc-300">
            {live?.lines.join("\n") || "No log output yet."}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
