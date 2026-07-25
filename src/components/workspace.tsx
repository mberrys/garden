"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, PanelRight, Redo2, Sparkles, Sun, Undo2 } from "lucide-react";
import { useWorkspace } from "@/lib/store/workspace";
import { flushPendingSaves } from "@/lib/store/workspace";
import { Sidebar } from "./sidebar";
import { PaneHost } from "./pane-host";
import { Toasts } from "./toasts";
import { AiPanel } from "./ai/ai-panel";
import { ProviderBadge } from "./ai/provider-badge";
import { Divider, IconButton } from "./ui";
import { DOC_KIND_LABELS } from "@/lib/docs/schema";

export default function Workspace() {
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
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <PaneHost />
      </main>
      {aiPanelOpen && <AiPanel onClose={() => setAiPanelOpen(false)} />}
      <Toasts />
    </div>
  );
}

function TopBar() {
  const activeDocId = useWorkspace((s) => s.panes[s.activePane].activeDocId);
  const doc = useWorkspace((s) => (activeDocId ? s.docs[activeDocId] : null));
  const undo = useWorkspace((s) => s.undo);
  const redo = useWorkspace((s) => s.redo);
  const history = useWorkspace((s) => (activeDocId ? s.history[activeDocId] : undefined));
  const aiPanelOpen = useWorkspace((s) => s.aiPanelOpen);
  const setAiPanelOpen = useWorkspace((s) => s.setAiPanelOpen);

  const canUndo = (history?.undo.length ?? 0) > 0;
  const canRedo = (history?.redo.length ?? 0) > 0;

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-raised px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {doc ? (
          <>
            <span className="truncate text-sm font-medium text-ink">{doc.title}</span>
            <span className="shrink-0 text-[11px] uppercase tracking-wide text-faint">
              {DOC_KIND_LABELS[doc.kind]}
            </span>
          </>
        ) : (
          <span className="text-sm text-faint">No document open</span>
        )}
      </div>

      {doc && (
        <>
          <IconButton
            label="Undo"
            size="sm"
            disabled={!canUndo}
            onClick={() => activeDocId && undo(activeDocId)}
          >
            <Undo2 size={15} />
          </IconButton>
          <IconButton
            label="Redo"
            size="sm"
            disabled={!canRedo}
            onClick={() => activeDocId && redo(activeDocId)}
          >
            <Redo2 size={15} />
          </IconButton>
          <Divider vertical />
        </>
      )}

      <ProviderBadge />
      <ThemeToggle />
      <IconButton
        label={aiPanelOpen ? "Hide AI panel" : "Show AI panel"}
        size="sm"
        active={aiPanelOpen}
        onClick={() => setAiPanelOpen(!aiPanelOpen)}
      >
        {aiPanelOpen ? <PanelRight size={15} /> : <Sparkles size={15} />}
      </IconButton>
    </header>
  );
}

/**
 * The theme lives on `<html>`, set by the inline bootstrap script before paint.
 * Reading it through `useSyncExternalStore` keeps the button in step with the
 * DOM (including changes made outside React) without a hydration mismatch —
 * the server snapshot is always "light", matching the pre-script markup.
 */
function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribeToTheme,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

  return (
    <IconButton
      label={dark ? "Switch to light theme" : "Switch to dark theme"}
      size="sm"
      onClick={() => {
        const next = !dark;
        document.documentElement.classList.toggle("dark", next);
        try {
          localStorage.setItem("rr.theme", next ? "dark" : "light");
        } catch {
          // Private browsing with storage disabled — the toggle still works for
          // this session, it just will not be remembered.
        }
      }}
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
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
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
