import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { APP_NAME } from "@/brand";
import { api } from "@/services/tauri";
import { useAppStore } from "@/store/appStore";
import { cn } from "@/lib/utils";
import type { AssistantReply } from "@/types";

const suggestions = [
  "What can I safely stop?",
  "Why is my machine slow?",
  "What is running on port 3000?",
  "Which projects are unused?",
];

export function AssistantPanel() {
  const open = useAppStore((s) => s.assistantOpen);
  const setOpen = useAppStore((s) => s.setAssistantOpen);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<AssistantReply | null>(null);

  async function ask(next = question) {
    if (!next.trim()) return;
    setBusy(true);
    try {
      const result = await api.ask(next.trim());
      setReply(result);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "flex h-full w-[320px] shrink-0 flex-col border-l border-border bg-card pt-[52px] transition-[width,opacity]",
        open ? "opacity-100" : "w-0 overflow-hidden border-0 opacity-0",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-sm font-semibold">{APP_NAME}</div>
          <div className="text-[11px] text-muted-foreground">Answers from your local snapshot</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 py-3">
        {suggestions.map((item) => (
          <button
            key={item}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-secondary"
            onClick={() => {
              setQuestion(item);
              void ask(item);
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <ScrollArea className="flex-1 px-4">
        {reply ? (
          <div className="space-y-2 pb-4">
            <Badge variant={reply.localOnly ? "secondary" : "default"}>
              {reply.localOnly ? "Local analysis" : "OpenAI"}
            </Badge>
            <div className="whitespace-pre-wrap text-sm leading-6">{reply.answer}</div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ask about ports, CPU, Docker, or idle projects. Cloud completion stays off until you enable it in Settings.
          </p>
        )}
      </ScrollArea>
      <div className="border-t border-border p-3">
        <Textarea
          rows={3}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={`Ask ${APP_NAME}…`}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              void ask();
            }
          }}
        />
        <Button className="mt-2 w-full" disabled={busy} onClick={() => void ask()}>
          {busy ? "Thinking…" : "Ask"}
        </Button>
      </div>
    </div>
  );
}
