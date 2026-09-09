import { Check, Copy, FolderOpen, Terminal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { folderName, homeRelative, parentFolder } from "@/lib/format";
import { api } from "@/services/tauri";

interface PathDetailsProps {
  path: string;
  home?: string | null;
  compact?: boolean;
  showCursor?: boolean;
}

export function PathDetails({ path, home, compact = false, showCursor = true }: PathDetailsProps) {
  const [copied, setCopied] = useState(false);
  const relative = homeRelative(path, home);
  const parent = parentFolder(path);
  const name = folderName(path);

  async function copy() {
    await navigator.clipboard.writeText(path);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="space-y-2">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Folder</div>
        <div className="text-sm font-medium">{name}</div>
      </div>
      {!compact && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Parent</div>
          <div className="break-all font-mono text-[11px] text-muted-foreground">
            {homeRelative(parent, home)}
          </div>
        </div>
      )}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Full path</div>
        <div className="break-all font-mono text-[11px] text-muted-foreground">{relative}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void api.openFolder(path)}>
          <FolderOpen className="h-3.5 w-3.5" /> Finder
        </Button>
        <Button size="sm" variant="outline" onClick={() => void api.openTerminal(path)}>
          <Terminal className="h-3.5 w-3.5" /> Terminal
        </Button>
        {showCursor && (
          <Button size="sm" onClick={() => void api.openInCursor(path)}>
            Cursor
          </Button>
        )}
      </div>
    </div>
  );
}
