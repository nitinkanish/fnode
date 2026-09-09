import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/appStore";

export function RefreshCountdown() {
  const lastLiveAt = useAppStore((s) => s.lastLiveAt);
  const pollMs = useAppStore((s) => Math.max(s.settings?.pollIntervalMs ?? 20_000, 10_000));
  const refreshLive = useAppStore((s) => s.refreshLive);
  const loading = useAppStore((s) => s.loading);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = lastLiveAt
    ? Math.max(0, Math.ceil((lastLiveAt + pollMs - now) / 1000))
    : Math.ceil(pollMs / 1000);

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[11px] text-muted-foreground sm:inline">
        {remaining > 0 ? `Next refresh in ${remaining}s` : "Refreshing…"}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => void refreshLive()}
        aria-label="Refresh now"
      >
        <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
      </Button>
    </div>
  );
}
