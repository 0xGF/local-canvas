import React from "react";
import {
  X,
  Check,
  AlertCircle,
  Loader2,
  Trash2,
  FileCode,
  Clock,
} from "./icons.js";
import { Button } from "./ui/button.js";
import { Badge } from "./ui/badge.js";
import { Separator } from "./ui/separator.js";
import { useChangesStore, type ChangeEntry } from "../stores/changes-store.js";

export function ChangesPanel() {
  const changes = useChangesStore((s) => s.changes);
  const panelOpen = useChangesStore((s) => s.panelOpen);
  const togglePanel = useChangesStore((s) => s.togglePanel);
  const clearChanges = useChangesStore((s) => s.clearChanges);

  if (!panelOpen) return null;

  return (
    <div
      style={{
        pointerEvents: "auto",
        animation: "canvasFadeUp 200ms cubic-bezier(0.16, 1, 0.3, 1) both",
      }}
      data-canvas-overlay="true"
      className="fixed bottom-16 right-4 w-80 max-h-96 bg-canvas-bg/95 backdrop-blur-md border border-canvas-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-canvas-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-canvas-fg">Changes</span>
          <Badge variant="secondary" className="text-[10px]">
            {changes.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {changes.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearChanges}
              className="h-5 w-5"
              title="Clear all"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePanel}
            className="h-5 w-5"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Changes list */}
      <div className="overflow-y-auto flex-1">
        {changes.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-canvas-muted-fg">
              No changes yet. Select an element and edit its properties.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-canvas-border">
            {changes.map((change) => (
              <ChangeItem key={change.id} change={change} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChangeItem({ change }: { change: ChangeEntry }) {
  const [expanded, setExpanded] = React.useState(false);

  const StatusIcon = {
    pending: <Loader2 className="h-3 w-3 text-canvas-accent animate-spin" />,
    applied: <Check className="h-3 w-3 text-green-400" />,
    failed: <AlertCircle className="h-3 w-3 text-canvas-destructive" />,
  }[change.status];

  const timeAgo = formatTimeAgo(change.timestamp);

  return (
    <div className="px-3 py-2">
      <div
        className={`flex items-start gap-2 -mx-1 px-1 rounded transition-colors ${
          change.diff ? "cursor-pointer hover:bg-canvas-muted/20" : ""
        }`}
        onClick={() => change.diff && setExpanded(!expanded)}
      >
        <div className="mt-0.5 shrink-0">{StatusIcon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-canvas-fg truncate">
            {change.description}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1 text-[10px] text-canvas-muted-fg">
              <FileCode className="h-2.5 w-2.5" />
              <span className="truncate max-w-[120px] font-mono">
                {change.filePath.split("/").pop()}
              </span>
              <span>:{change.line}</span>
            </span>
            <span className="flex items-center gap-1 text-[10px] text-canvas-muted-fg">
              <Clock className="h-2.5 w-2.5" />
              {timeAgo}
            </span>
          </div>
        </div>
        <Badge
          variant="outline"
          className="text-[9px] shrink-0 font-mono"
        >
          {change.type}
        </Badge>
      </div>

      {/* Diff view */}
      {expanded && change.diff && (
        <div className="mt-2 rounded-md bg-canvas-bg border border-canvas-border overflow-hidden">
          <pre className="text-[10px] font-mono p-2 overflow-x-auto">
            {change.diff.split("\n").map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith("+")
                    ? "text-green-400 bg-green-400/10"
                    : line.startsWith("-")
                      ? "text-red-400 bg-red-400/10"
                      : "text-canvas-muted-fg"
                }
              >
                {line}
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}
