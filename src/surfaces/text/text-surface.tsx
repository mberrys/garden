"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TextDoc } from "@/lib/docs/schema";
import { useWorkspace, type PaneIndex } from "@/lib/store/workspace";
import {
  blockIndexAtMarkdownOffset,
  docToMarkdown,
  docToPlainText,
  markdownToDoc,
} from "@/lib/text/markdown";

/**
 * Markdown text surface.
 *
 * The textarea is the editing surface; ProseMirror JSON remains the stored
 * document body so AI ops and cross-surface recipes keep working. Each edit
 * commits a coalesced `replaceDoc` so ctrl+Z uses the workspace history stack
 * (including accepted AI suggestions) instead of a separate editor plugin.
 */
export default function TextSurface({
  doc,
  paneIndex: _paneIndex,
}: {
  doc: TextDoc;
  paneIndex: PaneIndex;
}) {
  const commit = useWorkspace((s) => s.commit);
  const setSelection = useWorkspace((s) => s.setSelection);

  /**
   * Guards the two-way sync. `lastPushed` lets us tell our own echo from a
   * genuine external change (an accepted AI suggestion or an undo).
   */
  const lastPushed = useRef<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [markdown, setMarkdown] = useState(() => docToMarkdown(doc.body));

  // Reset sync tracking when switching documents so the new body always loads.
  useEffect(() => {
    lastPushed.current = "";
  }, [doc.id]);

  // Pull in changes that did not originate here — an accepted AI suggestion, or
  // an undo/redo of a prior commit.
  useEffect(() => {
    const incoming = JSON.stringify(doc.body);
    if (incoming === lastPushed.current) return;
    setMarkdown(docToMarkdown(doc.body));
    lastPushed.current = incoming;
  }, [doc.body]);

  useEffect(() => () => setSelection(doc.id, null), [doc.id, setSelection]);

  const persist = useCallback(
    (value: string) => {
      setMarkdown(value);
      const body = markdownToDoc(value);
      lastPushed.current = JSON.stringify(body);
      commit(doc.id, [{ op: "replaceDoc", markdown: value }], {
        coalesceKey: `text-type:${doc.id}`,
        label: "Edit",
      });
    },
    [commit, doc.id],
  );

  const publishSelectionFromTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    publishSelection(el.value, el.selectionStart, el.selectionEnd, doc.id, setSelection);
  }, [doc.id, setSelection]);

  const words = useMemo(() => {
    const text = docToPlainText(doc.body);
    return text ? text.split(/\s+/).filter(Boolean).length : 0;
  }, [doc.body]);

  const blocks = doc.body.content?.length ?? 0;
  const lines = markdown.length === 0 ? 0 : markdown.split("\n").length;

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <textarea
          ref={textareaRef}
          className="rr-markdown h-full w-full resize-none bg-transparent px-8 py-10 font-mono text-[13.5px] leading-7 text-ink outline-none placeholder:text-faint"
          value={markdown}
          placeholder="# Start writing markdown, or ask the assistant for a draft…"
          spellCheck
          aria-label="Markdown editor"
          onChange={(event) => persist(event.target.value)}
          onSelect={publishSelectionFromTextarea}
          onKeyUp={publishSelectionFromTextarea}
          onClick={publishSelectionFromTextarea}
        />
      </div>
      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-raised px-3 text-[11px] text-faint">
        <span>Markdown</span>
        <span>{words.toLocaleString()} words</span>
        <span>{lines.toLocaleString()} lines</span>
        <span>{blocks} blocks</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

/**
 * Publishes the selection as *block indices*, because that is how text ops
 * address content — the assistant is told "the user selected block 3" and can
 * act on it directly.
 */
function publishSelection(
  markdown: string,
  selectionStart: number,
  selectionEnd: number,
  docId: string,
  setSelection: ReturnType<typeof useWorkspace.getState>["setSelection"],
) {
  const startIndex = blockIndexAtMarkdownOffset(markdown, selectionStart);
  const endIndex = blockIndexAtMarkdownOffset(markdown, selectionEnd);

  if (selectionStart === selectionEnd) {
    setSelection(docId, { kind: "text", blockIndex: startIndex, blockCount: 0, text: "" });
    return;
  }

  setSelection(docId, {
    kind: "text",
    blockIndex: startIndex,
    blockCount: Math.max(1, endIndex - startIndex + 1),
    text: markdown.slice(selectionStart, selectionEnd),
  });
}
