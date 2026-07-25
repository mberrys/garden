"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  SLIDE_H,
  SLIDE_W,
  type DeckDoc,
  type Slide,
  type SlideElement,
} from "@/lib/docs/schema";
import {
  HANDLES,
  HANDLE_CURSORS,
  handlePosition,
  resizeRect,
  type HandleId,
} from "@/lib/canvas/geometry";
import { loadBlob } from "@/lib/store/workspace";
import { cx } from "@/components/ui";

/**
 * Renders a slide.
 *
 * The stage is always laid out at the deck's native 1280x720 and scaled with a
 * CSS transform. Everything downstream — element geometry, drag maths, the AI's
 * coordinates — therefore works in one fixed coordinate space, and a slide
 * looks identical in the rail thumbnail, the editor and the presenter.
 */

type Theme = DeckDoc["body"]["theme"];

interface DragState {
  type: "move" | "resize";
  handle?: HandleId;
  elementId: string;
  startX: number;
  startY: number;
  origin: { x: number; y: number; w: number; h: number };
  current?: { x: number; y: number; w: number; h: number };
}

export function SlideView({
  slide,
  theme,
  scale,
  editable = false,
  selectedElementIds = [],
  editingElementId = null,
  onSelectElement,
  onEditElement,
  onCommitElement,
  onMoveElement,
  minSize = 24,
}: {
  slide: Slide;
  theme: Theme;
  scale: number;
  editable?: boolean;
  selectedElementIds?: string[];
  editingElementId?: string | null;
  onSelectElement?: (id: string | null, additive: boolean) => void;
  onEditElement?: (id: string | null) => void;
  onCommitElement?: (id: string, patch: Record<string, unknown>) => void;
  onMoveElement?: (id: string, patch: Record<string, unknown>) => void;
  minSize?: number;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const beginDrag = useCallback(
    (event: React.PointerEvent, element: SlideElement, handle?: HandleId) => {
      if (!editable) return;
      event.stopPropagation();
      (event.target as Element).setPointerCapture?.(event.pointerId);
      const state: DragState = {
        type: handle ? "resize" : "move",
        handle,
        elementId: element.id,
        startX: event.clientX,
        startY: event.clientY,
        origin: { x: element.x, y: element.y, w: element.w, h: element.h },
      };
      dragRef.current = state;
      setDrag(state);
    },
    [editable],
  );

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      const state = dragRef.current;
      if (!state) return;
      // Pointer movement is in screen pixels; the stage is scaled, so convert
      // back to slide units or dragging drifts from the cursor.
      const dx = (event.clientX - state.startX) / scale;
      const dy = (event.clientY - state.startY) / scale;

      let next: { x: number; y: number; w: number; h: number };
      if (state.type === "move") {
        next = { ...state.origin, x: state.origin.x + dx, y: state.origin.y + dy };
      } else {
        // The handle's new position is simply where it started plus the drag.
        const start = handlePosition(state.origin, state.handle!);
        next = resizeRect(state.origin, state.handle!, { x: start.x + dx, y: start.y + dy }, minSize);
      }

      dragRef.current = { ...state, current: next };
      setDrag(dragRef.current);
    };

    const onUp = () => {
      const state = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!state?.current) return;
      const { x, y, w, h } = state.current;
      const changed =
        Math.abs(x - state.origin.x) > 0.5 ||
        Math.abs(y - state.origin.y) > 0.5 ||
        Math.abs(w - state.origin.w) > 0.5 ||
        Math.abs(h - state.origin.h) > 0.5;
      if (changed) {
        onMoveElement?.(state.elementId, {
          x: Math.round(x),
          y: Math.round(y),
          w: Math.round(w),
          h: Math.round(h),
        });
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, scale, minSize, onMoveElement]);

  const geometryFor = (element: SlideElement) =>
    drag?.elementId === element.id && drag.current ? drag.current : element;

  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{
        width: SLIDE_W * scale,
        height: SLIDE_H * scale,
        background: slide.background ?? theme.background,
        boxShadow: editable ? "var(--shadow-md)" : undefined,
      }}
      onPointerDown={() => editable && onSelectElement?.(null, false)}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})` }}
      >
        {slide.elements.map((element) => {
          const geometry = geometryFor(element);
          const selected = selectedElementIds.includes(element.id);
          const editing = editingElementId === element.id;

          return (
            <div
              key={element.id}
              className={cx("absolute", editable && "cursor-move")}
              style={{
                left: geometry.x,
                top: geometry.y,
                width: geometry.w,
                height: geometry.h,
                opacity: element.opacity,
                transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
                outline: selected ? `${2 / scale}px solid var(--accent)` : undefined,
                outlineOffset: 2 / scale,
              }}
              onPointerDown={(event) => {
                if (!editable || editing) return;
                onSelectElement?.(element.id, event.shiftKey);
                beginDrag(event, element);
              }}
              onDoubleClick={(event) => {
                if (!editable) return;
                event.stopPropagation();
                if (element.type === "text" || element.type === "bullets") {
                  onEditElement?.(element.id);
                }
              }}
            >
              {editing ? (
                <ElementEditor
                  element={element}
                  theme={theme}
                  onCommit={(patch) => onCommitElement?.(element.id, patch)}
                  onCancel={() => onEditElement?.(null)}
                />
              ) : (
                <ElementBody element={element} theme={theme} />
              )}

              {editable && selected && !editing && (
                <>
                  {HANDLES.map((handle) => (
                    <Handle
                      key={handle}
                      handle={handle}
                      scale={scale}
                      onPointerDown={(event) => beginDrag(event, element, handle)}
                    />
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Elements
 * ------------------------------------------------------------------ */

function ElementBody({ element, theme }: { element: SlideElement; theme: Theme }) {
  switch (element.type) {
    case "text":
      return (
        <div
          className="h-full w-full whitespace-pre-wrap break-words"
          style={{
            fontSize: element.fontSize,
            fontWeight: element.weight === "bold" ? 700 : element.weight === "semibold" ? 600 : 400,
            textAlign: element.align,
            color: element.color || theme.text,
            lineHeight: 1.25,
            display: "flex",
            flexDirection: "column",
            justifyContent:
              element.valign === "middle" ? "center" : element.valign === "bottom" ? "flex-end" : "flex-start",
          }}
        >
          {element.text}
        </div>
      );

    case "bullets":
      return (
        <ul
          className="h-full w-full"
          style={{
            fontSize: element.fontSize,
            color: element.color || theme.text,
            lineHeight: 1.5,
            listStyle: element.marker === "number" ? "decimal" : element.marker === "none" ? "none" : "disc",
            paddingLeft: element.marker === "none" ? 0 : "1.2em",
          }}
        >
          {element.items.map((item, i) => (
            <li key={i} style={{ marginBottom: "0.45em" }}>
              {element.marker === "dash" ? `— ${item}` : item}
            </li>
          ))}
        </ul>
      );

    case "shape": {
      if (element.shape === "line") {
        return (
          <div
            className="h-full w-full"
            style={{
              borderTop: `${Math.max(2, element.strokeWidth)}px solid ${element.stroke ?? element.fill ?? theme.accent}`,
              marginTop: element.h / 2,
            }}
          />
        );
      }
      return (
        <div
          className="h-full w-full"
          style={{
            background: element.fill ?? "transparent",
            border: element.stroke ? `${element.strokeWidth}px solid ${element.stroke}` : undefined,
            borderRadius: element.shape === "ellipse" ? "50%" : element.radius,
          }}
        />
      );
    }

    case "image":
      return <ImageElement element={element} theme={theme} />;
  }
}

function ImageElement({
  element,
  theme,
}: {
  element: Extract<SlideElement, { type: "image" }>;
  theme: Theme;
}) {
  // Held together with the blob it came from and matched during render, so a
  // changed blobId never shows the previous image's object URL.
  const [resolved, setResolved] = useState<{ blobId: string; url: string } | null>(null);

  useEffect(() => {
    const blobId = element.blobId;
    if (!blobId) return;
    let objectUrl: string | null = null;
    let cancelled = false;

    void loadBlob(blobId).then((blob) => {
      if (!blob || cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setResolved({ blobId, url: objectUrl });
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [element.blobId]);

  const url = resolved && resolved.blobId === element.blobId ? resolved.url : null;

  if (!url) {
    return (
      <div
        className="flex h-full w-full items-center justify-center border border-dashed"
        style={{ borderColor: theme.muted, color: theme.muted, fontSize: 20 }}
      >
        {element.alt || "Image"}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={element.alt}
      className="h-full w-full"
      style={{ objectFit: element.fit }}
      draggable={false}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Inline editing
 * ------------------------------------------------------------------ */

function ElementEditor({
  element,
  theme,
  onCommit,
  onCancel,
}: {
  element: SlideElement;
  theme: Theme;
  onCommit: (patch: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const initial =
    element.type === "bullets"
      ? element.items.join("\n")
      : element.type === "text"
        ? element.text
        : "";
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    if (element.type === "bullets") {
      onCommit({ items: value.split("\n").map((l) => l.trim()).filter(Boolean) });
    } else {
      onCommit({ text: value });
    }
  };

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
      }}
      className="h-full w-full resize-none bg-transparent outline-none"
      style={{
        fontSize: "fontSize" in element ? element.fontSize : 24,
        color: "color" in element ? element.color || theme.text : theme.text,
        lineHeight: element.type === "bullets" ? 1.5 : 1.25,
        outline: "2px solid var(--accent)",
      }}
    />
  );
}

function Handle({
  handle,
  scale,
  onPointerDown,
}: {
  handle: HandleId;
  scale: number;
  onPointerDown: (event: React.PointerEvent) => void;
}) {
  const size = 8 / scale;
  const position: React.CSSProperties = { position: "absolute", width: size, height: size };

  if (handle.includes("n")) position.top = -size / 2;
  if (handle.includes("s")) position.bottom = -size / 2;
  if (handle.includes("w")) position.left = -size / 2;
  if (handle.includes("e")) position.right = -size / 2;
  if (handle === "n" || handle === "s") {
    position.left = `calc(50% - ${size / 2}px)`;
  }
  if (handle === "e" || handle === "w") {
    position.top = `calc(50% - ${size / 2}px)`;
  }

  return (
    <div
      role="presentation"
      onPointerDown={onPointerDown}
      style={{
        ...position,
        background: "var(--accent)",
        border: `${1 / scale}px solid white`,
        borderRadius: 2 / scale,
        cursor: HANDLE_CURSORS[handle],
      }}
    />
  );
}
