"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  Download,
  Highlighter,
  MousePointer2,
  Square,
  StickyNote,
  Strikethrough,
  Underline,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Annotation, AnnotationType, EvidenceRef, PageCitation, PdfDoc, Rect } from "@/lib/docs/schema";
import { defaultColor } from "@/lib/ops/pdf";
import type { PdfOp } from "@/lib/ops";
import { loadBlob, storeBlob, useWorkspace, type PaneIndex } from "@/lib/store/workspace";
import { downloadBlob } from "@/lib/store/bundle";
import { destroyPdfDocument, loadPdfDocument } from "@/lib/pdf/loader";
import { exportAnnotatedPdf } from "@/lib/pdf/export";
import { Button, EmptyState, IconButton, Textarea, ToolbarGroup, cx } from "@/components/ui";
import { PdfPage } from "./pdf-page";

const ANNOTATION_TOOLS: { id: AnnotationType; label: string; icon: typeof Square }[] = [
  { id: "highlight", label: "Highlight", icon: Highlighter },
  { id: "underline", label: "Underline", icon: Underline },
  { id: "strikeout", label: "Strikeout", icon: Strikethrough },
  { id: "box", label: "Box", icon: Square },
  { id: "note", label: "Note", icon: StickyNote },
];

type Tool = "select" | AnnotationType;

export default function PdfSurface({
  doc,
  paneIndex: _paneIndex,
}: {
  doc: PdfDoc;
  paneIndex: PaneIndex;
}) {
  const commit = useWorkspace((s) => s.commit);
  const setSelection = useWorkspace((s) => s.setSelection);
  const toast = useWorkspace((s) => s.toast);

  /**
   * The loaded document is stored *with* the blob it came from, and `pdf` is
   * derived by matching the two. Keeping them separate would leave `pdf`
   * pointing at a destroyed document for the frames between one file being
   * torn down and the next finishing loading — and rendering a page off a
   * destroyed pdf.js document throws.
   */
  const [loaded, setLoaded] = useState<{ blobId: string; doc: PDFDocumentProxy } | null>(null);
  const [loadError, setLoadError] = useState<{ blobId: string; message: string } | null>(null);
  const [zoom, setZoom] = useState(1.2);
  const [tool, setTool] = useState<Tool>("select");
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));
  const [currentPage, setCurrentPage] = useState(1);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [narrow, setNarrow] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { blobId, pageCount, annotations, evidence, citations } = doc.body;

  const apply = useCallback(
    (ops: PdfOp[], options?: { skipHistory?: boolean; label?: string }) => {
      if (ops.length === 0) return;
      const result = commit<"pdf">(doc.id, ops, options);
      if (!result.ok) toast("error", result.error ?? "That change could not be applied.");
    },
    [commit, doc.id, toast],
  );

  /* ---------------- document loading ---------------- */

  useEffect(() => {
    if (!blobId) return;
    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;

    void (async () => {
      try {
        const blob = await loadBlob(blobId);
        if (!blob) throw new Error("the file is missing from local storage");
        const buffer = await blob.arrayBuffer();
        const document = await loadPdfDocument(buffer);
        if (cancelled) {
          void destroyPdfDocument(document);
          return;
        }
        opened = document;
        setLoaded({ blobId, doc: document });
      } catch (err) {
        if (!cancelled) {
          setLoadError({ blobId, message: err instanceof Error ? err.message : String(err) });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (opened) void destroyPdfDocument(opened);
    };
  }, [blobId]);

  const pdf = loaded && loaded.blobId === blobId ? loaded.doc : null;
  const error = loadError && loadError.blobId === blobId ? loadError.message : null;

  // The page count is only known once pdf.js has parsed the file, so it is
  // recorded on the document the first time it is opened.
  useEffect(() => {
    if (pdf && pdf.numPages !== pageCount) {
      apply(
        [
          {
            op: "setSource",
            blobId,
            fileName: doc.body.fileName,
            pageCount: pdf.numPages,
          },
        ],
        { skipHistory: true },
      );
    }
  }, [pdf, pageCount, blobId, doc.body.fileName, apply]);

  /* ---------------- responsive layout ---------------- */

  // A PDF opened in one half of a split view has very little room; a fixed
  // 240px annotation rail would leave the page itself unreadable, so it becomes
  // an overlay that is off by default below this width.
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < 720));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /* ---------------- selection ---------------- */

  useEffect(() => {
    setSelection(doc.id, {
      kind: "pdf",
      page: currentPage,
      text: "",
      annotationId: activeAnnotationId,
    });
  }, [doc.id, currentPage, activeAnnotationId, setSelection]);

  useEffect(() => () => setSelection(doc.id, null), [doc.id, setSelection]);

  /* ---------------- page virtualisation ---------------- */

  /**
   * Only pages near the viewport are rendered. A 300-page PDF at 1.2x would
   * otherwise allocate hundreds of full-size canvases and exhaust memory.
   */
  const observerRef = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((current) => {
          const next = new Set(current);
          let topMost: { page: number; top: number } | null = null;
          for (const entry of entries) {
            const page = Number((entry.target as HTMLElement).dataset.page);
            if (!page) continue;
            if (entry.isIntersecting) {
              next.add(page);
              const top = entry.boundingClientRect.top;
              if (!topMost || top < topMost.top) topMost = { page, top };
            } else {
              next.delete(page);
            }
          }
          if (topMost) setCurrentPage(topMost.page);
          return next;
        });
      },
      { root, rootMargin: "400px 0px" },
    );

    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [pdf]);

  const registerPage = useCallback((element: HTMLElement | null) => {
    if (element) observerRef.current?.observe(element);
  }, []);

  /* ---------------- annotations ---------------- */

  const annotationsByPage = useMemo(() => {
    const map = new Map<number, Annotation[]>();
    for (const annotation of annotations) {
      const list = map.get(annotation.page);
      if (list) list.push(annotation);
      else map.set(annotation.page, [annotation]);
    }
    return map;
  }, [annotations]);

  const addAnnotation = useCallback(
    (page: number, rect: Rect, quote: string) => {
      if (tool === "select") return;
      apply(
        [{ op: "addAnnotation", page, type: tool, rect, quote, color: defaultColor(tool) }],
        { label: `${tool} on page ${page}` },
      );
      setTool("select");
    },
    [tool, apply],
  );

  const activeAnnotation = annotations.find((a) => a.id === activeAnnotationId) ?? null;

  /* ---------------- file attach & export ---------------- */

  const attachFile = useCallback(
    async (file: File) => {
      try {
        const id = await storeBlob(file, file.name, "application/pdf");
        apply([{ op: "setSource", blobId: id, fileName: file.name, pageCount: 0 }], {
          label: "Attach PDF",
        });
      } catch (err) {
        toast("error", `Could not attach that file: ${err instanceof Error ? err.message : err}`);
      }
    },
    [apply, toast],
  );

  const exportPdf = useCallback(async () => {
    if (!blobId) return;
    try {
      const blob = await loadBlob(blobId);
      if (!blob) throw new Error("the original file is missing");
      const output = await exportAnnotatedPdf(await blob.arrayBuffer(), annotations);
      downloadBlob(output, `${doc.title || "document"} (annotated).pdf`);
      toast("success", "Exported with annotations flattened in.");
    } catch (err) {
      toast("error", `Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [blobId, annotations, doc.title, toast]);

  /* ---------------- render ---------------- */

  if (!blobId) {
    return (
      <div className="flex h-full flex-col">
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void attachFile(file);
            e.target.value = "";
          }}
        />
        <EmptyState
          title="No PDF attached"
          hint="Choose a PDF to read and annotate. You can also drop one anywhere in this pane."
          action={
            <Button variant="primary" onClick={() => fileInput.current?.click()}>
              <Upload size={14} />
              Choose a PDF
            </Button>
          }
        />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="This PDF could not be opened"
        hint={`${error}. The document itself is intact — try re-attaching the file.`}
      />
    );
  }

  const annotationsVisible = showAnnotations && (!narrow || annotations.length > 0);

  return (
    <div ref={rootRef} className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-raised px-3 py-1.5">
        <ToolbarGroup>
          <IconButton
            label="Select"
            size="sm"
            active={tool === "select"}
            onClick={() => setTool("select")}
          >
            <MousePointer2 size={14} />
          </IconButton>
          {ANNOTATION_TOOLS.map(({ id, label, icon: Icon }) => (
            <IconButton
              key={id}
              label={label}
              size="sm"
              active={tool === id}
              onClick={() => setTool(tool === id ? "select" : id)}
            >
              <Icon size={14} />
            </IconButton>
          ))}
        </ToolbarGroup>

        <span className="ml-1 text-xs text-faint">
          {tool === "select"
            ? "Select text, or pick a tool and drag over the page"
            : `Drag on a page to ${tool}`}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 text-xs tabular-nums text-muted">
            {currentPage} / {pdf?.numPages ?? pageCount ?? "…"}
          </span>
          <IconButton label="Zoom out" size="sm" onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}>
            <ZoomOut size={14} />
          </IconButton>
          <button
            type="button"
            onClick={() => setZoom(1.2)}
            className="min-w-11 rounded px-1 text-xs tabular-nums text-muted hover:bg-hover hover:text-ink"
            title="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <IconButton label="Zoom in" size="sm" onClick={() => setZoom((z) => Math.min(4, z + 0.2))}>
            <ZoomIn size={14} />
          </IconButton>
          <IconButton
            label={showAnnotations ? "Hide annotations panel" : "Show annotations panel"}
            size="sm"
            active={showAnnotations}
            onClick={() => setShowAnnotations((v) => !v)}
          >
            <StickyNote size={14} />
          </IconButton>
          <IconButton label="Export with annotations" size="sm" onClick={() => void exportPdf()}>
            <Download size={14} />
          </IconButton>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-sunken px-4 py-4">
          {pdf ? (
            <div className="mx-auto flex w-fit flex-col items-center gap-4">
              {Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((page) => (
                <PdfPage
                  key={page}
                  pdf={pdf}
                  pageNumber={page}
                  zoom={zoom}
                  visible={visiblePages.has(page)}
                  registerRef={registerPage}
                  annotations={annotationsByPage.get(page) ?? []}
                  activeAnnotationId={activeAnnotationId}
                  drawing={tool !== "select"}
                  onDraw={(rect, quote) => addAnnotation(page, rect, quote)}
                  onSelectAnnotation={setActiveAnnotationId}
                  onTextExtracted={(text) =>
                    apply([{ op: "setPageText", page, text }], { skipHistory: true })
                  }
                  onTextSelected={(text) =>
                    setSelection(doc.id, {
                      kind: "pdf",
                      page,
                      text,
                      annotationId: activeAnnotationId,
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-faint">
              Opening PDF…
            </div>
          )}
        </div>

        {annotationsVisible && (
        <AnnotationSidebar
          narrow={narrow}
          onClose={() => setShowAnnotations(false)}
          annotations={annotations}
          evidence={evidence}
          citations={citations}
          onCite={(annotation) =>
            apply(
              [
                {
                  op: "addCitation",
                  citation: { page: annotation.page, quote: annotation.quote, annotationId: annotation.id },
                },
                {
                  op: "addEvidence",
                  evidence: {
                    source: {
                      version: 1,
                      documentId: doc.id,
                      objectId: annotation.id,
                      anchor: { kind: "pdf-text", page: annotation.page, start: 0, end: annotation.quote.length },
                    },
                    relation: "supports",
                    capturedBy: "human",
                    note: annotation.note || annotation.quote,
                  },
                },
              ],
              { label: "Cite passage" },
            )
          }
          activeId={activeAnnotationId}
          onSelect={(id) => {
            setActiveAnnotationId(id);
            const annotation = annotations.find((a) => a.id === id);
            if (annotation) {
              scrollRef.current
                ?.querySelector(`[data-page="${annotation.page}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }}
          onNoteChange={(id, note) =>
            apply([{ op: "updateAnnotation", id, patch: { note } }], { label: "Edit note" })
          }
          onDelete={(id) => {
            apply([{ op: "deleteAnnotation", id }], { label: "Delete annotation" });
            if (activeAnnotationId === id) setActiveAnnotationId(null);
          }}
          activeAnnotation={activeAnnotation}
        />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Annotation list
 * ------------------------------------------------------------------ */

function AnnotationSidebar({
  annotations,
  evidence,
  citations,
  activeId,
  activeAnnotation,
  narrow,
  onClose,
  onSelect,
  onNoteChange,
  onDelete,
  onCite,
}: {
  annotations: Annotation[];
  evidence: EvidenceRef[];
  citations: PageCitation[];
  activeId: string | null;
  activeAnnotation: Annotation | null;
  narrow: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNoteChange: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onCite: (annotation: Annotation) => void;
}) {
  const value = activeAnnotation?.note ?? "";
  const [noteDraft, setNoteDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);

  // Adjust during render rather than in an effect: switching annotations must
  // never show the previous one's note, not even for a frame.
  if (value !== lastValue) {
    setLastValue(value);
    setNoteDraft(value);
  }

  return (
    <aside
      className={cx(
        "flex w-60 flex-col border-l border-line bg-raised",
        narrow
          ? "absolute right-0 top-0 bottom-0 z-20 shadow-[var(--shadow-lg)]"
          : "shrink-0",
      )}
    >
      <div className="flex items-center border-b border-line px-3 py-2 text-xs font-medium text-ink">
        <span className="flex-1">
          Annotations
          <span className="ml-1.5 font-normal text-faint">{annotations.length}</span>
        </span>
        <IconButton label="Hide annotations panel" size="sm" className="-mr-1 h-5 w-5" onClick={onClose}>
          <X size={12} />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {annotations.length === 0 ? (
          <p className="px-2 py-4 text-center text-[11px] leading-relaxed text-faint">
            Pick a tool above and drag over a page, or ask the assistant to highlight the key
            passages.
          </p>
        ) : (
          [...annotations]
            .sort((a, b) => a.page - b.page || a.rect.y - b.rect.y)
            .map((annotation) => (
              <button
                key={annotation.id}
                type="button"
                onClick={() => onSelect(annotation.id)}
                className={cx(
                  "mb-1 flex w-full gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                  activeId === annotation.id ? "bg-active" : "hover:bg-hover",
                )}
              >
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: annotation.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] uppercase tracking-wide text-faint">
                    p{annotation.page} · {annotation.type}
                  </span>
                  <span className="block truncate text-[11px] text-ink">
                    {annotation.quote || annotation.note || "(no text)"}
                  </span>
                </span>
              </button>
            ))
        )}
      </div>

      {activeAnnotation && (
        <div className="shrink-0 space-y-1.5 border-t border-line p-2">
          <label className="block text-[10px] uppercase tracking-wide text-faint">Note</label>
          <Textarea
            rows={3}
            value={noteDraft}
            placeholder="Why does this matter?"
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={() => {
              if (noteDraft !== activeAnnotation.note) onNoteChange(activeAnnotation.id, noteDraft);
            }}
            className="text-xs"
          />
          <Button
            size="sm"
            variant="ghost"
            className="w-full"
            onClick={() => onCite(activeAnnotation)}
          >
            Cite as evidence
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="w-full"
            onClick={() => onDelete(activeAnnotation.id)}
          >
            Delete annotation
          </Button>
          {(citations.length > 0 || evidence.length > 0) && (
            <p className="text-[10px] text-faint">
              {citations.length} citation{citations.length === 1 ? "" : "s"} · {evidence.length} evidence
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
