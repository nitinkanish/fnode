import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LogResult } from "@/types";

interface LogViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logs: LogResult | null;
}

export function LogViewer({ open, onOpenChange, logs }: LogViewerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{logs?.title ?? "Logs"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[420px] rounded-lg border border-border bg-black/40">
          <pre className="whitespace-pre-wrap p-4 font-mono text-xs leading-5 text-zinc-300">
            {logs?.lines.join("\n") || "No log output yet."}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
