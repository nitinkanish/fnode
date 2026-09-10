import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/store/appStore";
import type { PageId } from "@/types";

const pages = new Set<PageId>([
  "dashboard",
  "apps",
  "ports",
  "processes",
  "projects",
  "docker",
  "ai",
  "brew",
  "cache",
  "settings",
]);

export function useNativeMenu() {
  const setPage = useAppStore((s) => s.setPage);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setAssistantOpen = useAppStore((s) => s.setAssistantOpen);
  const refreshLive = useAppStore((s) => s.refreshLive);
  const focusSearch = useAppStore((s) => s.focusSearch);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<string>("fnode://menu", (event) => {
      const action = event.payload;
      if (action === "find") {
        focusSearch();
        return;
      }
      if (action === "reload") {
        void refreshLive();
        return;
      }
      if (action === "sidebar") {
        toggleSidebar();
        return;
      }
      if (action === "ask") {
        setAssistantOpen(!useAppStore.getState().assistantOpen);
        return;
      }
      if (action === "about") {
        useAppStore.getState().setSettingsTab("about");
        setPage("settings");
        return;
      }
      if (pages.has(action as PageId)) {
        setPage(action as PageId);
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => undefined);
    return () => unlisten?.();
  }, [setPage, toggleSidebar, setAssistantOpen, refreshLive, focusSearch]);
}
