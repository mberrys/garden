"use client";

import { AlertCircle, Check, X } from "lucide-react";
import { useWorkspace } from "@/lib/store/workspace";
import { IconButton, cx } from "./ui";

export function Toasts() {
  const toasts = useWorkspace((s) => s.toasts);
  const dismiss = useWorkspace((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-200 flex w-[min(28rem,90vw)] -translate-x-1/2 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cx(
            "pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-[var(--shadow-md)]",
            toast.tone === "error"
              ? "border-transparent bg-danger-soft text-danger"
              : toast.tone === "success"
                ? "border-transparent bg-ok-soft text-ok"
                : "border-line bg-raised text-ink",
          )}
        >
          {toast.tone === "error" ? (
            <AlertCircle size={14} className="mt-px shrink-0" />
          ) : toast.tone === "success" ? (
            <Check size={14} className="mt-px shrink-0" />
          ) : null}
          <span className="flex-1 leading-relaxed">{toast.message}</span>
          <IconButton
            label="Dismiss"
            size="sm"
            className="-mr-1 h-4 w-4 hover:bg-black/10"
            onClick={() => dismiss(toast.id)}
          >
            <X size={12} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
