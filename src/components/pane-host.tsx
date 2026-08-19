"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Columns2, X } from "lucide-react";
import { useWorkspace, workspaceShowsPacketPicker, type PaneIndex } from "@/lib/store/workspace";
import { importFile } from "@/lib/store/bundle";
import { Button, EmptyState, IconButton, cx } from "./ui";
import { DocIcon } from "./doc-icon";
import { SurfaceHost } from "./surface-host";
import { SeedPacketPicker } from "./seed-packet-picker";

const MIN_PANE_FRACTION = 0.2;

export function PaneHost() {
  const splitView = useWorkspace((s) => s.splitView);
  const [split, setSplit] = useState(0.5);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    setSplit(Math.max(MIN_PANE_FRACTION, Math.min(1 - MIN_PANE_FRACTION, fraction)));
  }, []);

  useEffect(() => {
    const stop = () => {
      draggingRef.current = false;
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
    };
  }, [onPointerMove]);

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1">
      <Pane index={0} style={{ width: splitView ? `${split * 100}%` : "100%" }} />
      {splitView && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panes"
            onPointerDown={() => {
              draggingRef.current = true;
              document.body.style.cursor = "col-resize";
            }}
            className="group relative w-px shrink-0 cursor-col-resize bg-[var(--border)]"
          >
            <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-accent/20" />
          </div>
          <Pane index={1} style={{ width: `${(1 - split) * 100}%` }} />
        </>
      )}
    </div>
  );
}

function Pane({ index, style }: { index: PaneIndex; style?: React.CSSProperties }) {
  const pane = useWorkspace((s) => s.panes[index]);
  const docs = useWorkspace((s) => s.docs);
  const activePane = useWorkspace((s) => s.activePane);
  const splitView = useWorkspace((s) => s.splitView);
  const openDoc = useWorkspace((s) => s.openDoc);
  const closeDoc = useWorkspace((s) => s.closeDoc);
  const setActivePane = useWorkspace((s) => s.setActivePane);
  const setSplitView = useWorkspace((s) => s.setSplitView);
  const toast = useWorkspace((s) => s.toast);
  const requestPacketPicker = useWorkspace((s) => s.requestPacketPicker);
  const showPicker = useWorkspace((s) => index === 0 && workspaceShowsPacketPicker(s));
  const seedSuppressed = useWorkspace((s) => s.seedSuppressed);
  const emptyWorkspace = useWorkspace((s) => s.order.length === 0);
  const [dropping, setDropping] = useState(false);

  const activeDoc = pane.activeDocId ? docs[pane.activeDocId] : null;
  const focused = splitView && activePane === index;

  return (
    <section
      style={style}
      onPointerDownCapture={() => setActivePane(index)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={async (e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDropping(false);
        for (const file of Array.from(e.dataTransfer.files)) {
          try {
            await importFile(file);
          } catch (err) {
            toast("error", err instanceof Error ? err.message : String(err));
          }
        }
      }}
      className={cx(
        "relative flex min-w-0 flex-col bg-bg",
        focused && "ring-1 ring-inset ring-accent/40",
      )}
    >
      <div className="flex h-9 shrink-0 items-stretch border-b border-line bg-sunken">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {pane.docIds.map((docId) => {
            const doc = docs[docId];
            if (!doc) return null;
            const isActive = pane.activeDocId === docId;
            return (
              <div
                key={docId}
                className={cx(
                  "group flex min-w-0 max-w-52 items-center gap-1.5 border-r border-line px-2.5",
                  isActive ? "bg-bg text-ink" : "text-muted hover:bg-hover",
                )}
              >
                <DocIcon kind={doc.kind} size={13} />
                <button
                  type="button"
                  onClick={() => openDoc(docId, index)}
                  className="min-w-0 flex-1 truncate text-left text-xs"
                  title={doc.title}
                >
                  {doc.title}
                </button>
                <IconButton
                  label={`Close ${doc.title}`}
                  size="sm"
                  onClick={() => closeDoc(docId, index)}
                  className={cx(
                    "h-4 w-4 opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                    isActive && "opacity-60",
                  )}
                >
                  <X size={12} />
                </IconButton>
              </div>
            );
          })}
        </div>
        {index === 0 && (
          <div className="flex shrink-0 items-center px-1.5">
            <IconButton
              label={splitView ? "Close split view" : "Split view"}
              size="sm"
              active={splitView}
              onClick={() => setSplitView(!splitView)}
            >
              <Columns2 size={14} />
            </IconButton>
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {activeDoc ? (
          <SurfaceHost doc={activeDoc} paneIndex={index} />
        ) : showPicker ? (
          <SeedPacketPicker />
        ) : (
          <EmptyState
            title={index === 0 ? "Nothing open" : "Split pane"}
            hint={
              index === 0
                ? "Pick a document from the sidebar, create a new one, or drop a PDF anywhere in this pane."
                : "Open a second document here to work across two surfaces at once — a PDF beside a deck, say."
            }
            action={
              index === 0 && emptyWorkspace && !seedSuppressed ? (
                <Button size="sm" onClick={requestPacketPicker}>
                  Plant a seed packet
                </Button>
              ) : undefined
            }
          />
        )}
        {dropping && (
          <div className="pointer-events-none absolute inset-3 rounded-xl border-2 border-dashed border-accent bg-accent-soft/40" />
        )}
      </div>
    </section>
  );
}
