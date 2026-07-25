"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { ProviderStatus } from "@/lib/ai/config";
import { Badge } from "../ui";

interface ProviderState {
  status: ProviderStatus | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Shared so the header badge and the AI panel agree on which provider is live
 * without probing twice.
 */
export const useProvider = create<ProviderState>((set) => ({
  status: null,
  loading: false,
  refresh: async () => {
    set({ loading: true });
    try {
      const response = await fetch("/api/ai/status", { cache: "no-store" });
      set({ status: (await response.json()) as ProviderStatus, loading: false });
    } catch {
      set({
        status: {
          provider: "mock",
          model: "scripted-mock",
          baseUrl: "",
          available: [],
          reason: "status check failed",
        },
        loading: false,
      });
    }
  },
}));

export function ProviderBadge() {
  const status = useProvider((s) => s.status);
  const refresh = useProvider((s) => s.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!status) return null;

  const isLocal = status.provider === "local";
  const shortModel = status.model.length > 22 ? `${status.model.slice(0, 21)}…` : status.model;

  return (
    <button type="button" onClick={() => void refresh()} title={describe(status)}>
      <Badge tone={isLocal ? "ok" : "warn"}>
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: isLocal ? "var(--ok)" : "var(--warn)" }}
        />
        {isLocal ? shortModel : "mock provider"}
      </Badge>
    </button>
  );
}

function describe(status: ProviderStatus): string {
  if (status.provider === "local") {
    return `Local model "${status.model}" at ${status.baseUrl}. Click to re-check.`;
  }
  return (
    `No local model in use${status.reason ? ` — ${status.reason}` : ""}. ` +
    `Replies are scripted, not generated. Start a local OpenAI-compatible server ` +
    `(e.g. ollama serve) at ${status.baseUrl} and click to re-check.`
  );
}
