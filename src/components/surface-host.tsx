"use client";

import dynamic from "next/dynamic";
import { Component, type ComponentType, type ReactNode } from "react";
import type { Doc, DocKind } from "@/lib/docs/schema";
import type { PaneIndex } from "@/lib/store/workspace";
import { getSurface } from "@/lib/surfaces/registry";
import { EmptyState } from "./ui";

const loading = () => (
  <div className="flex h-full items-center justify-center text-xs text-faint">Loading…</div>
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dynamicCache = new Map<DocKind, ComponentType<any>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDynamicSurface(kind: DocKind): ComponentType<any> {
  let cached = dynamicCache.get(kind);
  if (!cached) {
    cached = dynamic(() => getSurface(kind).loadComponent(), { ssr: false, loading });
    dynamicCache.set(kind, cached);
  }
  return cached;
}

export function SurfaceHost({ doc, paneIndex }: { doc: Doc; paneIndex: PaneIndex }) {
  return (
    <SurfaceBoundary key={doc.id} title={doc.title}>
      {renderSurface(doc, paneIndex)}
    </SurfaceBoundary>
  );
}

function renderSurface(doc: Doc, paneIndex: PaneIndex): ReactNode {
  const Surface = getDynamicSurface(doc.kind);
  return <Surface doc={doc} paneIndex={paneIndex} />;
}

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
