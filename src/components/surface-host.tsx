"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import type { CanvasDoc, DatabaseDoc, DeckDoc, Doc, PdfDoc, TextDoc } from "@/lib/docs/schema";
import type { PaneIndex } from "@/lib/store/workspace";
import { EmptyState } from "./ui";

/**
 * Surfaces are loaded on demand and never server-rendered: each one reaches for
 * canvas, worker or DOM-measurement APIs during mount, and the PDF surface
 * pulls in pdf.js, which is far too large to sit in the initial bundle.
 */
const loading = () => (
  <div className="flex h-full items-center justify-center text-xs text-faint">Loading…</div>
);

const TextSurface = dynamic(() => import("@/surfaces/text/text-surface"), { ssr: false, loading });
const CanvasSurface = dynamic(() => import("@/surfaces/canvas/canvas-surface"), {
  ssr: false,
  loading,
});
const DeckSurface = dynamic(() => import("@/surfaces/deck/deck-surface"), { ssr: false, loading });
const PdfSurface = dynamic(() => import("@/surfaces/pdf/pdf-surface"), { ssr: false, loading });
const DatabaseSurface = dynamic(() => import("@/surfaces/database/database-surface"), {
  ssr: false,
  loading,
});

export function SurfaceHost({ doc, paneIndex }: { doc: Doc; paneIndex: PaneIndex }) {
  return (
    <SurfaceBoundary key={doc.id} title={doc.title}>
      {renderSurface(doc, paneIndex)}
    </SurfaceBoundary>
  );
}

function renderSurface(doc: Doc, paneIndex: PaneIndex): ReactNode {
  switch (doc.kind) {
    case "text":
      return <TextSurface doc={doc as TextDoc} paneIndex={paneIndex} />;
    case "canvas":
      return <CanvasSurface doc={doc as CanvasDoc} paneIndex={paneIndex} />;
    case "deck":
      return <DeckSurface doc={doc as DeckDoc} paneIndex={paneIndex} />;
    case "pdf":
      return <PdfSurface doc={doc as PdfDoc} paneIndex={paneIndex} />;
    case "database":
      return <DatabaseSurface doc={doc as DatabaseDoc} paneIndex={paneIndex} />;
  }
}

/**
 * One surface crashing must not take the workspace with it — the other pane may
 * hold unsaved work, and everything is already persisted per document.
 */
class SurfaceBoundary extends Component<
  { children: ReactNode; title: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <EmptyState
          title="This surface hit an error"
          hint={`${this.props.title}: ${this.state.error.message}. Your document is saved — reopening it usually clears this.`}
        />
      );
    }
    return this.props.children;
  }
}
