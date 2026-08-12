"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TextDoc } from "@/lib/docs/schema";
import { useWorkspace, type PaneIndex } from "@/lib/store/workspace";
import {
  blockIndexAtMarkdownOffset,
  docToMarkdown,
  docToPlainText,
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
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const incoming = JSON.stringify(doc.body);
    if (incoming === lastPushed.current) return;
    setMarkdown(docToMarkdown(doc.body));
    lastPushed.current = incoming;
  }, [doc.body]);

  useEffect(() => () => setSelection(doc.id, null), [doc.id, setSelection]);

  const publishSelectionFromTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setSelected(Math.max(0, end - start));
    publishSelection(el.value, start, end, doc.id, setSelection);
  }, [doc.id, setSelection]);

  const onChange = (value: string) => {
    setMarkdown(value);
    const result = commit(
      doc.id,
      [{ op: "replaceDoc", markdown: value }],
      { coalesceKey: `text-type:${doc.id}`, label: "Edit" },
    );
    if (result.ok) {
      // Match what the store will hold after markdown→PM round-trip so the
      // next remote sync does not stomp the caret mid-typing.
      const nextDoc = useWorkspace.getState().docs[doc.id];
      if (nextDoc?.kind === "text") {
        lastPushed.current = JSON.stringify(nextDoc.body);
      }
    }
  };

  const words = useMemo(() => {
    const text = docToPlainText(doc.body);
    return text ? text.split(/\s+/).filter(Boolean).length : 0;
  }, [doc.body]);

  const blocks = doc.body.content?.length ?? 0;
  const lines = markdown.length === 0 ? 0 : markdown.split("\n").length;

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto bg-bg">
        <div className="mx-auto flex h-full w-full max-w-[46rem] flex-col px-8 py-10">
          <textarea
            ref={textareaRef}
            className="garden-markdown min-h-full w-full flex-1 resize-none bg-transparent font-mono text-[15px] leading-7 text-ink outline-none"
            value={markdown}
            spellCheck
            placeholder="Start writing markdown, or ask the assistant for a draft…"
            onChange={(e) => onChange(e.target.value)}
            onSelect={publishSelectionFromTextarea}
            onKeyUp={publishSelectionFromTextarea}
            onClick={publishSelectionFromTextarea}
          />
        </div>
      </div>
      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-raised px-3 text-[11px] text-faint">
        <span>{words.toLocaleString()} words</span>
        <span>{blocks} blocks</span>
        <span>{lines} lines</span>
        {selected > 0 && <span className="text-accent">{selected} selected</span>}
      </div>
    </div>
  );
}

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
