import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/appStore";
import type { AppNotice } from "@/types";

export function NotificationBell() {
  const notices = useAppStore((s) => s.notices);
  const unread = useAppStore((s) => s.unreadNotices);
  const markNoticesRead = useAppStore((s) => s.markNoticesRead);
  const dismissNotice = useAppStore((s) => s.dismissNotice);
  const clearNotices = useAppStore((s) => s.clearNotices);
  const setPage = useAppStore((s) => s.setPage);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={root} className="relative">
      <Button
        variant="outline"
        size="sm"
        className="relative px-2.5"
        onClick={() => {
          setOpen((value) => !value);
          markNoticesRead();
        }}
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-[320px] overflow-hidden rounded-[10px] border border-border bg-popover shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="text-sm font-medium">Notifications</div>
            {notices.length > 0 && (
              <button
                className="text-[11px] text-muted-foreground hover:text-foreground"
                onClick={clearNotices}
              >
                Clear all
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notices.length === 0 && (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                No alerts yet. High CPU, heat, and new localhost apps show up here.
              </p>
            )}
            {notices.map((notice) => (
              <button
                key={notice.id}
                className="block w-full border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-secondary/50"
                onClick={() => {
                  dismissNotice(notice.id);
                  setOpen(false);
                  if (notice.id.includes("local:")) setPage("apps");
                  else setPage("dashboard");
                }}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${dot(notice)}`} />
                  <span className="text-sm font-medium">{notice.title}</span>
                </div>
                <p className="mt-0.5 pl-3.5 text-xs text-muted-foreground">{notice.body}</p>
                <p className="mt-1 pl-3.5 text-[10px] text-muted-foreground">{ago(notice.ts)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function dot(notice: AppNotice) {
  if (notice.severity === "critical") return "bg-red-400";
  if (notice.severity === "warning") return "bg-amber-400";
  return "bg-sky-400";
}

function ago(ts: number) {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
