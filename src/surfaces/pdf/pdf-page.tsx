"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { Annotation, Rect } from "@/lib/docs/schema";
import { extractPageText } from "@/lib/pdf/loader";
import { normalizeRect } from "@/lib/canvas/geometry";
import { cx } from "@/components/ui";

/**
 * A single rendered page with its annotation overlay.
 *
 * Renders to a canvas at device resolution, with a transparent text layer above
 * it for real selection, and the annotation overlay above that. Annotation
 * geometry is stored normalised (0..1 of the page box) so it survives zoom
 * changes and re-rendering at a different scale.
 */
export function PdfPage({
  pdf,
  pageNumber,
  zoom,
  visible,
  registerRef,
  annotations,
  activeAnnotationId,
  drawing,
  onDraw,
  onSelectAnnotation,
  onTextExtracted,
  onTextSelected,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  visible: boolean;
  registerRef: (element: HTMLElement | null) => void;
  annotations: Annotation[];
  activeAnnotationId: string | null;
  drawing: boolean;
  onDraw: (rect: Rect, quote: string) => void;
  onSelectAnnotation: (id: string) => void;
  onTextExtracted: (text: string) => void;
  onTextSelected: (text: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const extractedRef = useRef(false);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<Rect | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  /* ---------------- page geometry ---------------- */

  useEffect(() => {
    let cancelled = false;
    void pdf.getPage(pageNumber).then((page: PDFPageProxy) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: zoom });
      setSize({ width: Math.floor(viewport.width), height: Math.floor(viewport.height) });
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, zoom]);

  /* ---------------- rendering ---------------- */

  useEffect(() => {
    if (!visible || size.width === 0) return;
    let cancelled = false;

    void (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);

      // A page still rendering when the zoom changes must be cancelled, or two
      // render tasks race on the same canvas and produce a torn frame.
      renderTaskRef.current?.cancel();
      const task = page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      });
      renderTaskRef.current = task;

      try {
        await task.promise;
      } catch {
        return; // cancelled
      }
      if (cancelled) return;

      await renderTextLayer(page, viewport, textLayerRef.current);

      if (!extractedRef.current) {
        extractedRef.current = true;
        const text = await extractPageText(pdf, pageNumber);
        if (!cancelled && text.trim()) onTextExtracted(text);
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [pdf, pageNumber, zoom, visible, size.width, onTextExtracted]);

  /* ---------------- drawing annotations ---------------- */

  const toNormalized = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      };
    },
    [],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!drawing) return;
      event.preventDefault();
      (event.target as Element).setPointerCapture?.(event.pointerId);
      dragRef.current = toNormalized(event);
      setDraft({ ...dragRef.current, w: 0, h: 0 });
    },
    [drawing, toNormalized],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const start = dragRef.current;
      if (!start) return;
      const point = toNormalized(event);
      setDraft(normalizeRect({ x: start.x, y: start.y, w: point.x - start.x, h: point.y - start.y }));
    },
    [toNormalized],
  );

  const onPointerUp = useCallback(() => {
    const rect = draft;
    dragRef.current = null;
    setDraft(null);
    if (!rect) return;

    // A click rather than a drag: give a note a sensible default footprint.
    const normalized =
      rect.w < 0.01 || rect.h < 0.005
        ? { x: rect.x, y: rect.y, w: Math.max(rect.w, 0.2), h: Math.max(rect.h, 0.03) }
        : rect;

    onDraw(normalized, textWithin(textLayerRef.current, normalized));
  }, [draft, onDraw]);

  return (
    <div
      ref={(element) => {
        containerRef.current = element;
        registerRef(element);
      }}
      data-page={pageNumber}
      className="relative shrink-0 bg-white shadow-[var(--shadow-sm)]"
      style={{ width: size.width || 640, height: size.height || 860 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onMouseUp={() => {
        const selected = window.getSelection()?.toString().trim();
        if (selected) onTextSelected(selected);
      }}
    >
      {visible ? (
        <>
          <canvas
            ref={canvasRef}
            style={{ width: size.width, height: size.height }}
            aria-label={`Page ${pageNumber}`}
          />
          <div
            ref={textLayerRef}
            className={cx(
              "absolute inset-0 overflow-hidden leading-none",
              drawing ? "pointer-events-none select-none" : "select-text",
            )}
            style={{ opacity: 0.01 }}
            aria-hidden
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-faint">
          Page {pageNumber}
        </div>
      )}

      {/* Annotation overlay */}
      <div className="pointer-events-none absolute inset-0">
        {annotations.map((annotation) => (
          <AnnotationMark
            key={annotation.id}
            annotation={annotation}
            active={activeAnnotationId === annotation.id}
            onSelect={() => onSelectAnnotation(annotation.id)}
          />
        ))}
        {draft && (
          <div
            className="absolute border-2 border-dashed border-accent bg-accent-soft/40"
            style={{
              left: `${draft.x * 100}%`,
              top: `${draft.y * 100}%`,
              width: `${draft.w * 100}%`,
              height: `${draft.h * 100}%`,
            }}
          />
        )}
      </div>

      <div className="pointer-events-none absolute -bottom-4 left-0 text-[10px] text-faint">
        {pageNumber}
      </div>
    </div>
  );
}

function AnnotationMark({
  annotation,
  active,
  onSelect,
}: {
  annotation: Annotation;
  active: boolean;
  onSelect: () => void;
}) {
  const base: React.CSSProperties = {
    position: "absolute",
    left: `${annotation.rect.x * 100}%`,
    top: `${annotation.rect.y * 100}%`,
    width: `${annotation.rect.w * 100}%`,
    height: `${annotation.rect.h * 100}%`,
    pointerEvents: "auto",
    cursor: "pointer",
  };

  const style: React.CSSProperties = { ...base };
  switch (annotation.type) {
    case "highlight":
      style.background = annotation.color;
      style.opacity = active ? 0.55 : 0.35;
      style.mixBlendMode = "multiply";
      break;
    case "underline":
      style.borderBottom = `2px solid ${annotation.color}`;
      break;
    case "strikeout":
      // A line through the middle, drawn as a background so it scales with the
      // box rather than needing a nested element.
      style.background = `linear-gradient(to bottom, transparent calc(50% - 1px), ${annotation.color} calc(50% - 1px), ${annotation.color} calc(50% + 1px), transparent calc(50% + 1px))`;
      break;
    case "box":
      style.border = `2px solid ${annotation.color}`;
      style.borderRadius = 2;
      break;
    case "note":
      style.borderLeft = `3px solid ${annotation.color}`;
      style.background = `${annotation.color}22`;
      break;
  }

  if (active) style.outline = "2px solid var(--accent)";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${annotation.type} on page ${annotation.page}`}
      title={annotation.note || annotation.quote}
      style={style}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Text layer
 * ------------------------------------------------------------------ */

/**
 * Positions pdf.js text items over the rendered page so browser text selection
 * works. The layer is nearly invisible — the glyphs are already painted on the
 * canvas; these spans exist only to be selected and measured.
 */
async function renderTextLayer(
  page: PDFPageProxy,
  viewport: { width: number; height: number; transform: number[] },
  container: HTMLDivElement | null,
): Promise<void> {
  if (!container) return;
  container.replaceChildren();

  const content = await page.getTextContent();
  const fragment = document.createDocumentFragment();

  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;

    const transform = item.transform as number[];
    const [a, b, , , e, f] = transform;
    // pdf.js gives PDF-space coordinates; apply the viewport transform to get
    // CSS pixels with the origin at the top-left.
    const x = viewport.transform[0] * e + viewport.transform[2] * f + viewport.transform[4];
    const y = viewport.transform[1] * e + viewport.transform[3] * f + viewport.transform[5];
    const fontHeight = Math.hypot(a, b) * Math.abs(viewport.transform[3] || 1);

    const span = document.createElement("span");
    span.textContent = item.str;
    span.style.position = "absolute";
    span.style.left = `${x}px`;
    span.style.top = `${y - fontHeight}px`;
    span.style.fontSize = `${fontHeight}px`;
    span.style.fontFamily = "sans-serif";
    span.style.whiteSpace = "pre";
    span.style.transformOrigin = "0 0";
    span.dataset.x = String(x);
    span.dataset.y = String(y - fontHeight);
    span.dataset.h = String(fontHeight);
    fragment.appendChild(span);
  }

  container.appendChild(fragment);
}

/**
 * The text sitting under a normalised rect — captured when an annotation is
 * created so the assistant can read what was marked without re-deriving it.
 */
function textWithin(container: HTMLDivElement | null, rect: Rect): string {
  if (!container) return "";
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return "";

  const left = rect.x * width;
  const top = rect.y * height;
  const right = left + rect.w * width;
  const bottom = top + rect.h * height;

  const parts: string[] = [];
  for (const child of Array.from(container.children)) {
    const span = child as HTMLElement;
    const x = Number(span.dataset.x);
    const y = Number(span.dataset.y);
    const h = Number(span.dataset.h) || 10;
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    const centreY = y + h / 2;
    if (centreY >= top && centreY <= bottom && x + span.offsetWidth >= left && x <= right) {
      parts.push(span.textContent ?? "");
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}
