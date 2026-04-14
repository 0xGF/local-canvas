import React, { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useEditorStore } from "../stores/editor-store.js";
import { useChangesStore } from "../stores/changes-store.js";
import { useWebSocket } from "../hooks/useWebSocket.js";
import { THEME } from "../theme.js";
import { Save } from "./icons.js";

const C = THEME;

export const SaveModal = React.memo(function SaveModal() {
  const open = useEditorStore((s) => s.saveModalOpen);
  const setSaveModalOpen = useEditorStore((s) => s.setSaveModalOpen);
  const pendingCount = useEditorStore((s) => s.pendingCount);
  const markSaved = useEditorStore((s) => s.markSaved);
  const changes = useChangesStore((s) => s.changes);
  const clearChanges = useChangesStore((s) => s.clearChanges);
  const { send } = useWebSocket();

  const handleSave = useCallback(() => {
    send({ type: "save" as any });
    markSaved();
    clearChanges();
    setSaveModalOpen(false);
  }, [send, markSaved, clearChanges, setSaveModalOpen]);

  const handleDiscard = useCallback(() => {
    setSaveModalOpen(false);
  }, [setSaveModalOpen]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={handleDiscard}
            style={{
              position: "fixed", inset: 0, zIndex: 2147483646,
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(2px)",
            }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.12 }}
            style={{
              position: "fixed",
              top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 2147483647,
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: 24,
              boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
              width: 340,
              fontFamily: C.font,
              pointerEvents: "auto",
            }}
            data-canvas-overlay="true"
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: "rgba(12,140,233,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Save size={18} style={{ color: C.accent }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.fg }}>Save Changes</div>
                <div style={{ fontSize: 11, color: C.fgMuted, marginTop: 2 }}>
                  {pendingCount} unsaved change{pendingCount !== 1 ? "s" : ""}
                </div>
              </div>
            </div>

            {/* File list */}
            {changes.length > 0 && (
              <div style={{
                maxHeight: 120, overflowY: "auto",
                marginBottom: 16, padding: "6px 0",
                borderTop: `1px solid ${C.border}`,
                borderBottom: `1px solid ${C.border}`,
              }}>
                {changes.slice(0, 8).map((change) => (
                  <div key={change.id} style={{
                    fontSize: 10, fontFamily: C.mono, color: C.fgDim,
                    padding: "3px 0",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {change.filePath.split("/").pop()}:{change.line} — {change.description}
                  </div>
                ))}
                {changes.length > 8 && (
                  <div style={{ fontSize: 10, color: C.fgMuted, padding: "3px 0" }}>
                    +{changes.length - 8} more...
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSave}
                style={{
                  flex: 1, height: 32, borderRadius: 6, border: "none",
                  background: C.accent, color: "#fff",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  fontFamily: C.font,
                }}
              >
                Save ({navigator.platform.includes("Mac") ? "\u2318" : "Ctrl+"}S)
              </button>
              <button
                onClick={handleDiscard}
                style={{
                  height: 32, padding: "0 14px", borderRadius: 6,
                  border: `1px solid ${C.border}`, background: "transparent",
                  color: C.fgDim, fontSize: 12, fontWeight: 500,
                  cursor: "pointer", fontFamily: C.font,
                }}
              >
                Cancel
              </button>
            </div>

            <div style={{ fontSize: 9, color: C.fgMuted, marginTop: 10, textAlign: "center" }}>
              Press Enter to save, Escape to cancel
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});
