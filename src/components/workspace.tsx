"use client";

import { toggleTheme } from "@/lib/theme";
import { useThemeMode } from "./theme-provider";
import { Moon, PanelRight, Redo2, Sparkles, Sun, Undo2 } from "lucide-react";
import { useEffect } from "react";
import { useWorkspace } from "@/lib/store/workspace";
import { flushPendingSaves } from "@/lib/store/workspace";
import { Sidebar } from "./sidebar";
import { PaneHost } from "./pane-host";
import { Toasts } from "./toasts";
import { AiPanel } from "./ai/ai-panel";
import { ProviderBadge } from "./ai/provider-badge";
import { Divider, IconButton } from "./ui";
import { getSurface } from "@/lib/surfaces";
import { WindowChromeStrip } from "./window-chrome";
import { listFlavors } from "@/lib/flavors";
import { PlanPreviewBanner } from "./plan-preview";

export default function Workspace() {
  useThemeMode();
  const ready = useWorkspace((s) => s.ready);
  const init = useWorkspace((s) => s.init);
  const aiPanelOpen = useWorkspace((s) => s.aiPanelOpen);
  const setAiPanelOpen = useWorkspace((s) => s.setAiPanelOpen);

  useEffect(() => {
    void init();
  }, [init]);

  // Best-effort flush when the tab goes away. `visibilitychange` fires on mobile
  // task-switching where `beforeunload` does not.
  useEffect(() => {
    const flush = () => void flushPendingSaves();
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  useGlobalShortcuts();

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-faint">
        Opening workspace…
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg text-ink">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <PaneHost />
      </main>
      {aiPanelOpen && <AiPanel onClose={() => setAiPanelOpen(false)} />}
      <Toasts />
      <PlanPreviewBanner />
    </div>
  );
}

function TopBar() {
  const activeDocId = useWorkspace((s) => s.panes[s.activePane].activeDocId);
  const doc = useWorkspace((s) => (activeDocId ? s.docs[activeDocId] : null));
  const undo = useWorkspace((s) => s.undo);
  const redo = useWorkspace((s) => s.redo);
  const canUndo = useWorkspace((s) => (activeDocId ? s.canUndo(activeDocId) : s.txUndo.length > 0));
  const canRedo = useWorkspace((s) => (activeDocId ? s.canRedo(activeDocId) : s.txRedo.length > 0));
  const aiPanelOpen = useWorkspace((s) => s.aiPanelOpen);
  const setAiPanelOpen = useWorkspace((s) => s.setAiPanelOpen);
  const flavorId = useWorkspace((s) => s.flavorId);
  const setFlavor = useWorkspace((s) => s.setFlavor);

  return (
    <WindowChromeStrip as="header" className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-raised px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {doc ? (
          <>
            <span className="truncate text-sm font-medium text-ink">{doc.title}</span>
            <span className="shrink-0 text-[11px] uppercase tracking-wide text-faint">
              {getSurface(doc.kind).label}
            </span>
          </>
        ) : (
          <span className="text-sm text-faint">No document open</span>
        )}
      </div>

      <IconButton
        label="Undo"
        size="sm"
        disabled={!canUndo}
        onClick={() => undo(activeDocId ?? "")}
      >
        <Undo2 size={15} />
      </IconButton>
      <IconButton
        label="Redo"
        size="sm"
        disabled={!canRedo}
        onClick={() => redo(activeDocId ?? "")}
      >
        <Redo2 size={15} />
      </IconButton>
      <Divider vertical />

      <ProviderBadge />
      <select
        aria-label="Flavor"
        className="h-7 rounded-md border border-line bg-raised px-1.5 text-[11px] text-muted"
        value={flavorId ?? "default"}
        onChange={(e) => setFlavor(e.target.value === "default" ? null : e.target.value)}
      >
        {listFlavors().map((flavor) => (
          <option key={flavor.id} value={flavor.id}>
            {flavor.label}
          </option>
        ))}
      </select>
      <ThemeToggle />
      <IconButton
        label={aiPanelOpen ? "Hide AI panel" : "Show AI panel"}
        size="sm"
        active={aiPanelOpen}
        onClick={() => setAiPanelOpen(!aiPanelOpen)}
      >
        {aiPanelOpen ? <PanelRight size={15} /> : <Sparkles size={15} />}
      </IconButton>
    </WindowChromeStrip>
  );
}

function ThemeToggle() {
  const dark = useThemeMode() === "dark";

  return (
    <IconButton
      label={dark ? "Switch to light theme" : "Switch to dark theme"}
      size="sm"
      onClick={() => toggleTheme()}
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
    </IconButton>
  );
}

/**
 * Workspace-level shortcuts. Surface-level ones live with their surface.
 * Undo/redo use the workspace history for every document kind, including
 * markdown text (coalesced typing + AI commits).
 */
function useGlobalShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const state = useWorkspace.getState();
      const docId = state.panes[state.activePane].activeDocId;
      const doc = docId ? state.docs[docId] : null;

      if (e.key === "\\") {
        e.preventDefault();
        state.setSplitView(!state.splitView);
        return;
      }
      if (e.key.toLowerCase() === "j") {
        e.preventDefault();
        state.setAiPanelOpen(!state.aiPanelOpen);
        return;
      }

      if (!docId || !doc) return;
      // Allow undo/redo while the markdown textarea is focused; other surfaces
      // still ignore shortcuts when a generic input has focus.
      if (doc.kind !== "text" && isTypingTarget(e.target)) return;

      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        state.undo(docId);
      } else if (
        (e.key.toLowerCase() === "z" && e.shiftKey) ||
        e.key.toLowerCase() === "y" ||
        e.key.toLowerCase() === "x"
      ) {
        e.preventDefault();
        state.redo(docId);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
