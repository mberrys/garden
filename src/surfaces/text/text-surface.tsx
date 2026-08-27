"use client";

import dynamic from "next/dynamic";
import type { TextDoc } from "@/lib/docs/schema";
import type { PaneIndex } from "@/lib/store/workspace";

/** Client-only: `prosemirror-view` touches `document` at import time. */
const WriterEditor = dynamic(() => import("./writer-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-muted">Opening editor…</div>
  ),
});

export default function TextSurface({
  doc,
  paneIndex,
}: {
  doc: TextDoc;
  paneIndex: PaneIndex;
}) {
  return <WriterEditor doc={doc} paneIndex={paneIndex} />;
}
