"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Copy, Play, Plus, Trash2 } from "lucide-react";
import {
  SLIDE_H,
  SLIDE_W,
  type DeckDoc,
  type Slide,
  type SlideElement,
  type SlideLayout,
} from "@/lib/docs/schema";
import { SLIDE_LAYOUTS } from "@/lib/docs/schema";
import { makeSlide } from "@/lib/docs/factories";
import type { DeckOp } from "@/lib/ops";
import { useWorkspace, type PaneIndex } from "@/lib/store/workspace";
import { Button, IconButton, Menu, MenuItem, MenuLabel, Textarea, cx } from "@/components/ui";
import { SlideView } from "./slide-view";
import { Presenter } from "./presenter";
import { ElementInspector } from "./element-inspector";
import { downloadBlob } from "@/lib/store/bundle";
import { downloadablePptxName, exportDeckPptxBytes } from "@/lib/deck/export-pptx";

const MIN_ELEMENT = 24;

export default function DeckSurface({
  doc,
  paneIndex: _paneIndex,
}: {
  doc: DeckDoc;
  paneIndex: PaneIndex;
}) {
  const commit = useWorkspace((s) => s.commit);
  const setSelection = useWorkspace((s) => s.setSelection);
  const toast = useWorkspace((s) => s.toast);

  const slides = doc.body.slides;
  const [activeIndex, setActiveIndex] = useState(0);
  const [rawSelectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const stageRef = useRef<HTMLDivElement>(null);

  const index = Math.min(activeIndex, Math.max(0, slides.length - 1));
  const slide = slides[index] as Slide | undefined;

  /**
   * Derived, not pruned in an effect: elements disappear from under the
   * selection whenever an AI suggestion is undone or a slide changes, and
   * filtering here means no render ever sees a dangling element id.
   */
  const selectedElementIds = useMemo(() => {
    if (!slide) return [];
    const present = new Set(slide.elements.map((e) => e.id));
    return rawSelectedElementIds.filter((id) => present.has(id));
  }, [rawSelectedElementIds, slide]);

  const apply = useCallback(
    (ops: DeckOp[], label?: string) => {
      if (ops.length === 0) return;
      const result = commit<"deck">(doc.id, ops, { label });
      if (!result.ok) toast("error", result.error ?? "That change could not be applied.");
      return result.ok;
    },
    [commit, doc.id, toast],
  );

  /* ---------------- selection ---------------- */

  useEffect(() => {
    setSelection(doc.id, {
      kind: "deck",
      slideId: slide?.id ?? null,
      elementIds: selectedElementIds,
    });
  }, [doc.id, slide?.id, selectedElementIds, setSelection]);

  useEffect(() => () => setSelection(doc.id, null), [doc.id, setSelection]);

  /* ---------------- stage sizing ---------------- */

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Letterbox the 16:9 stage inside whatever space the pane gives us.
  const scale = useMemo(() => {
    if (stageSize.width === 0) return 0;
    const padding = 48;
    return Math.min(
      (stageSize.width - padding) / SLIDE_W,
      (stageSize.height - padding) / SLIDE_H,
    );
  }, [stageSize]);

  /* ---------------- slide actions ---------------- */

  const addSlide = useCallback(
    (layout: SlideLayout) => {
      apply([{ op: "addSlide", layout, title: "New slide", index: index + 1 }], "Add slide");
      setActiveIndex(index + 1);
      setSelectedElementIds([]);
    },
    [apply, index],
  );

  const duplicateSlide = useCallback(() => {
    if (!slide) return;
    const copy = structuredClone(slide);
    const fresh = makeSlide(copy.layout);
    // Reuse fresh ids so the duplicate is independent of the original.
    const duplicated: Slide = {
      ...copy,
      id: fresh.id,
      elements: copy.elements.map((element, i) => ({
        ...element,
        id: `${fresh.id}_e${i}`,
      })),
    };
    apply([{ op: "insertSlide", slide: duplicated, index: index + 1 }], "Duplicate slide");
    setActiveIndex(index + 1);
  }, [apply, slide, index]);

  const deleteSlide = useCallback(() => {
    if (!slide) return;
    if (slides.length === 1) {
      toast("info", "A deck needs at least one slide.");
      return;
    }
    apply([{ op: "deleteSlide", id: slide.id }], "Delete slide");
    setActiveIndex(Math.max(0, index - 1));
    setSelectedElementIds([]);
  }, [apply, slide, slides.length, index, toast]);

  /* ---------------- element actions ---------------- */

  const patchElement = useCallback(
    (elementId: string, patch: Record<string, unknown>, label?: string) => {
      if (!slide) return;
      apply([{ op: "updateElement", slideId: slide.id, id: elementId, patch }], label);
    },
    [apply, slide],
  );

  const addElement = useCallback(
    (type: SlideElement["type"]) => {
      if (!slide) return;
      const seed: Record<string, unknown> =
        type === "text"
          ? { text: "Text", x: 200, y: 300, w: 500, h: 80, fontSize: 32 }
          : type === "bullets"
            ? { items: ["Point one", "Point two"], x: 200, y: 260, w: 600, h: 220 }
            : type === "shape"
              ? { shape: "rect", x: 440, y: 260, w: 400, h: 200 }
              : { alt: "Image", x: 340, y: 200, w: 600, h: 340 };
      apply([{ op: "addElement", slideId: slide.id, element: { type, ...seed } }], `Add ${type}`);
    },
    [apply, slide],
  );

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    // Editor shortcuts are inert while presenting — the presenter binds its own,
    // and leaving both attached is not merely redundant: this handler's setState
    // flushes synchronously on a discrete event, and the resulting re-render
    // detaches the presenter's listener *before* the same keydown reaches it, so
    // Escape would never exit the presentation.
    if (presenting) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement;
      const typing =
        active instanceof HTMLElement &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
      if (typing || event.metaKey || event.ctrlKey) return;

      if (event.key === "Escape") {
        setSelectedElementIds([]);
        setEditingElementId(null);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, slides.length - 1));
        setSelectedElementIds([]);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        setSelectedElementIds([]);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedElementIds.length && slide) {
        event.preventDefault();
        apply(
          selectedElementIds.map((id) => ({ op: "deleteElement", slideId: slide.id, id }) as DeckOp),
          "Delete elements",
        );
        setSelectedElementIds([]);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [presenting, slides.length, selectedElementIds, slide, apply]);

  if (presenting && slides.length > 0) {
    return (
      <Presenter
        deck={doc}
        startIndex={index}
        onExit={(finalIndex) => {
          setPresenting(false);
          setActiveIndex(finalIndex);
        }}
      />
    );
  }

  return (
    <div className="flex h-full">
      <SlideRail
        slides={slides}
        activeIndex={index}
        theme={doc.body.theme}
        onSelect={(next) => {
          setActiveIndex(next);
          setSelectedElementIds([]);
        }}
        onReorder={(from, to) => {
          const moving = slides[from];
          if (!moving) return;
          apply([{ op: "moveSlide", id: moving.id, toIndex: to }], "Reorder slides");
          setActiveIndex(to);
        }}
        onAdd={() => addSlide("bullets")}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-raised px-3 py-1.5">
          <Menu
            trigger={({ toggle }) => (
              <Button size="sm" variant="ghost" onClick={toggle}>
                <Plus size={13} />
                Slide
              </Button>
            )}
          >
            <MenuLabel>Layout</MenuLabel>
            {SLIDE_LAYOUTS.map((layout) => (
              <MenuItem key={layout} onClick={() => addSlide(layout)}>
                {layout.replace("-", " ")}
              </MenuItem>
            ))}
          </Menu>

          <Menu
            trigger={({ toggle }) => (
              <Button size="sm" variant="ghost" onClick={toggle} disabled={!slide}>
                <Plus size={13} />
                Element
              </Button>
            )}
          >
            {(["text", "bullets", "shape", "image"] as const).map((type) => (
              <MenuItem key={type} onClick={() => addElement(type)}>
                {type[0].toUpperCase() + type.slice(1)}
              </MenuItem>
            ))}
          </Menu>

          <IconButton label="Duplicate slide" size="sm" onClick={duplicateSlide} disabled={!slide}>
            <Copy size={14} />
          </IconButton>
          <IconButton
            label="Delete slide"
            size="sm"
            onClick={deleteSlide}
            disabled={!slide || slides.length <= 1}
          >
            <Trash2 size={14} />
          </IconButton>

          <span className="ml-auto text-xs text-faint">
            {slides.length > 0 ? `${index + 1} / ${slides.length}` : "empty"}
          </span>
          <Button size="sm" variant="default" onClick={() => setPresenting(true)} disabled={!slide}>
            <Play size={13} />
            Present
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!slide}
            onClick={() => {
              const bytes = exportDeckPptxBytes(doc);
              const copy = new Uint8Array(bytes.byteLength);
              copy.set(bytes);
              downloadBlob(
                new Blob([copy.buffer], {
                  type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                }),
                downloadablePptxName(doc.title),
              );
            }}
          >
            Export PPTX
          </Button>
        </div>

        <div ref={stageRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-sunken p-6">
          {slide && scale > 0 ? (
            <SlideView
              slide={slide}
              theme={doc.body.theme}
              scale={scale}
              editable
              selectedElementIds={selectedElementIds}
              editingElementId={editingElementId}
              onSelectElement={(id, additive) => {
                if (!id) {
                  setSelectedElementIds([]);
                  return;
                }
                setSelectedElementIds((current) =>
                  additive
                    ? current.includes(id)
                      ? current.filter((x) => x !== id)
                      : [...current, id]
                    : [id],
                );
              }}
              onEditElement={setEditingElementId}
              onCommitElement={(id, patch) => {
                patchElement(id, patch, "Edit element");
                setEditingElementId(null);
              }}
              onMoveElement={(id, patch) => patchElement(id, patch, "Move element")}
              minSize={MIN_ELEMENT}
            />
          ) : (
            <p className="text-xs text-faint">
              {slides.length === 0 ? "This deck has no slides yet." : "Sizing…"}
            </p>
          )}
        </div>

        {slide && (
          <div className="shrink-0 border-t border-line bg-raised px-3 py-2">
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-faint">
              Speaker notes
            </label>
            <NotesEditor
              key={slide.id}
              value={slide.notes}
              onCommit={(notes) =>
                apply([{ op: "setSlide", id: slide.id, patch: { notes } }], "Edit notes")
              }
            />
          </div>
        )}
      </div>

      {slide && selectedElementIds.length > 0 && (
        <ElementInspector
          elements={slide.elements.filter((e) => selectedElementIds.includes(e.id))}
          onPatch={(patch) =>
            apply(
              selectedElementIds.map(
                (id) => ({ op: "updateElement", slideId: slide.id, id, patch }) as DeckOp,
              ),
              "Restyle element",
            )
          }
          onDelete={() => {
            apply(
              selectedElementIds.map(
                (id) => ({ op: "deleteElement", slideId: slide.id, id }) as DeckOp,
              ),
              "Delete elements",
            );
            setSelectedElementIds([]);
          }}
          onReorder={(direction) => {
            const id = selectedElementIds[0];
            const current = slide.elements.findIndex((e) => e.id === id);
            if (current === -1) return;
            const toIndex = direction === "front" ? slide.elements.length - 1 : 0;
            apply([{ op: "reorderElement", slideId: slide.id, id, toIndex }], "Restack");
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Rail
 * ------------------------------------------------------------------ */

function SlideRail({
  slides,
  activeIndex,
  theme,
  onSelect,
  onReorder,
  onAdd,
}: {
  slides: Slide[];
  activeIndex: number;
  theme: DeckDoc["body"]["theme"];
  onSelect: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onAdd: () => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <div className="flex w-40 shrink-0 flex-col border-r border-line bg-sunken">
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i);
              setDragIndex(null);
            }}
            className="mb-2"
          >
            <button
              type="button"
              onClick={() => onSelect(i)}
              className={cx(
                "block w-full overflow-hidden rounded-md border-2 transition-colors",
                activeIndex === i ? "border-accent" : "border-transparent hover:border-line-strong",
                dragIndex === i && "opacity-40",
              )}
            >
              <SlideView slide={slide} theme={theme} scale={128 / SLIDE_W} />
            </button>
            <div className="mt-0.5 text-center text-[10px] text-faint">{i + 1}</div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center justify-center gap-1 border-t border-line py-2 text-xs text-muted hover:bg-hover hover:text-ink"
      >
        <Plus size={13} />
        Add slide
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Notes
 * ------------------------------------------------------------------ */

function NotesEditor({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);

  // Adjusting state during render (React's documented pattern for "reset when a
  // prop changes") rather than in an effect: a suggestion accepted while this
  // field is focused has to win, without a frame showing the stale draft.
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  return (
    <Textarea
      rows={2}
      value={draft}
      placeholder="What to say on this slide…"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      className="text-xs"
    />
  );
}
