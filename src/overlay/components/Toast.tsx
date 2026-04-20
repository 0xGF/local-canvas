import React, { useEffect, useState } from "react";
import { Check, X, AlertCircle } from "./icons.js";
import { create } from "zustand";

interface ToastData {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastState {
  toasts: ToastData[];
  add: (message: string, type: ToastData["type"]) => void;
  remove: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  add: (message, type) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },
  remove: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(message: string, type: ToastData["type"] = "info") {
  useToastStore.getState().add(message, type);
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{ pointerEvents: "auto" }}
      className="fixed top-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-[2147483647]"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => remove(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast: t,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: () => void;
}) {
  const [entering, setEntering] = useState(true);

  useEffect(() => {
    requestAnimationFrame(() => setEntering(false));
  }, []);

  const Icon = {
    success: <Check className="h-3.5 w-3.5 text-green-400" />,
    error: <AlertCircle className="h-3.5 w-3.5 text-canvas-destructive" />,
    info: <Check className="h-3.5 w-3.5 text-canvas-accent" />,
  }[t.type];

  return (
    <div
      className={`flex items-center gap-2 bg-canvas-bg/95 backdrop-blur-md border border-canvas-border rounded-lg px-3 py-2 shadow-2xl transition-all duration-200 ${
        entering ? "opacity-0 -translate-y-2" : "opacity-100 translate-y-0"
      }`}
    >
      {Icon}
      <span className="text-xs text-canvas-fg">{t.message}</span>
      <button
        onClick={onDismiss}
        className="ml-1 text-canvas-muted-fg hover:text-canvas-fg"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
