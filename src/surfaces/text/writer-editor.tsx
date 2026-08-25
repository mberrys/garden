"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { keymap } from "prosemirror-keymap";
import {
  baseKeymap,
  chainCommands,
  exitCode,
  setBlockType,
  toggleMark,
  wrapIn,
} from "prosemirror-commands";
import { wrapInList, splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list";
import { inputRules, textblockTypeInputRule, wrappingInputRule } from "prosemirror-inputrules";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { TextDoc } from "@/lib/docs/schema";
import { useWorkspace, type PaneIndex } from "@/lib/store/workspace";
import { downloadBytes, downloadableName } from "@/lib/store/bundle";
import { exportOffice } from "@/lib/interchange";
import { docToPlainText } from "@/lib/text/markdown";
import { gardenSchema } from "@/lib/text/pm-schema";
import {
  createGardenEditorState,
  gardenBodyToPm,
  selectionFromPm,
  textOpsFromPmReplace,
} from "@/lib/text/pm-bridge";

function writerPlugins() {
  const { bold, italic, code } = gardenSchema.marks;
  const { heading, paragraph, codeBlock, blockquote, bulletList, orderedList, listItem, hardBreak } =
    gardenSchema.nodes;
  return [
    inputRules({
      rules: [
        wrappingInputRule(/^\s*([-+*])\s$/, bulletList),
        wrappingInputRule(/^\s*(\d+)\.\s$/, orderedList),
        wrappingInputRule(/^\s*>\s$/, blockquote),
        textblockTypeInputRule(/^```$/, codeBlock),
        textblockTypeInputRule(/^(#{1,6})\s$/, heading, (match) => ({
          level: match[1].length,
        })),
      ],
    }),
    keymap({
      "Mod-b": toggleMark(bold),
      "Mod-i": toggleMark(italic),
      "Mod-`": toggleMark(code),
      "Shift-Ctrl-1": setBlockType(heading, { level: 1 }),
      "Shift-Ctrl-2": setBlockType(heading, { level: 2 }),
      "Shift-Ctrl-0": setBlockType(paragraph),
      "Shift-Ctrl-8": wrapInList(bulletList),
      "Shift-Ctrl-9": wrapInList(orderedList),
      "Shift-Ctrl-.": wrapIn(blockquote),
      Enter: splitListItem(listItem),
      "Mod-[": liftListItem(listItem),
      "Mod-]": sinkListItem(listItem),
      "Shift-Enter": chainCommands(exitCode, (state, dispatch) => {
        dispatch?.(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView());
        return true;
      }),
    }),
    keymap(baseKeymap),
  ];
}

export default function WriterEditor({
  doc,
}: {
  doc: TextDoc;
  paneIndex: PaneIndex;
}) {
  const commit = useWorkspace((s) => s.commit);
  const setSelection = useWorkspace((s) => s.setSelection);
  const toast = useWorkspace((s) => s.toast);
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const docRef = useRef(doc);
  const applyingRef = useRef(false);
  const lastPushed = useRef("");
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const plugins = writerPlugins();
    const view = new EditorView(mount, {
      state: createGardenEditorState(docRef.current.body, plugins),
      attributes: {
        class:
          "garden-markdown garden-prose min-h-full w-full flex-1 bg-transparent text-[15px] leading-7 text-ink outline-none",
        "aria-label": "Document editor",
        spellcheck: "true",
      },
      dispatchTransaction(tr) {
        const next = view.state.apply(tr);
        view.updateState(next);
        if (tr.selectionSet) {
          const sel = selectionFromPm(next);
          setSelection(docRef.current.id, sel);
          setSelected(sel.text.length);
        }
        if (!tr.docChanged || applyingRef.current || view.composing) return;
        publish(next.doc, view);
      },
      handleDOMEvents: {
        compositionend() {
          const current = viewRef.current;
          if (!current || applyingRef.current) return false;
          publish(current.state.doc, current);
          return false;
        },
      },
    });

    function publish(pmDoc: EditorState["doc"], current: EditorView) {
      const ops = textOpsFromPmReplace(docRef.current, pmDoc);
      const result = commit(docRef.current.id, ops, {
        coalesceKey: `text-type:${docRef.current.id}`,
        label: "Edit",
      });
      if (result.ok) {
        const stored = useWorkspace.getState().docs[docRef.current.id];
        if (stored?.kind === "text") {
          lastPushed.current = JSON.stringify(stored.body);
          docRef.current = stored;
        }
      }
      void current;
    }

    viewRef.current = view;
    lastPushed.current = JSON.stringify(docRef.current.body);
    view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
      setSelection(docRef.current.id, null);
    };
  }, [commit, doc.id, setSelection]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const incoming = JSON.stringify(doc.body);
    if (incoming === lastPushed.current) return;
    applyingRef.current = true;
    const pmDoc = gardenBodyToPm(doc.body);
    const from = Math.min(view.state.selection.from, pmDoc.content.size);
    view.updateState(
      EditorState.create({
        schema: gardenSchema,
        doc: pmDoc,
        plugins: view.state.plugins,
        selection: TextSelection.near(pmDoc.resolve(from)),
      }),
    );
    applyingRef.current = false;
    lastPushed.current = incoming;
  }, [doc.body]);

  const words = useMemo(() => {
    const text = docToPlainText(doc.body);
    return text ? text.split(/\s+/).filter(Boolean).length : 0;
  }, [doc.body]);

  const blocks = doc.body.content?.length ?? 0;

  function run(command: (state: EditorState, dispatch?: EditorView["dispatch"]) => boolean) {
    const view = viewRef.current;
    if (!view) return;
    command(view.state, view.dispatch);
    view.focus();
  }

  function exportFormat(format: "docx" | "odt") {
    void exportOffice(doc, format)
      .then(({ bytes }) => {
        const mime =
          format === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/vnd.oasis.opendocument.text";
        downloadBytes(bytes, downloadableName(doc.title, format), mime);
      })
      .catch((err: unknown) => {
        toast("error", err instanceof Error ? err.message : `Could not export ${format.toUpperCase()}.`);
      });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line bg-raised px-2">
        <FormatButton label="Bold" onClick={() => run(toggleMark(gardenSchema.marks.bold))}>
          B
        </FormatButton>
        <FormatButton label="Italic" onClick={() => run(toggleMark(gardenSchema.marks.italic))}>
          <span className="italic">I</span>
        </FormatButton>
        <FormatButton label="Inline code" onClick={() => run(toggleMark(gardenSchema.marks.code))}>
          {"</>"}
        </FormatButton>
        <span className="mx-1 h-4 w-px bg-line" />
        <FormatButton
          label="Heading 1"
          onClick={() => run(setBlockType(gardenSchema.nodes.heading, { level: 1 }))}
        >
          H1
        </FormatButton>
        <FormatButton
          label="Heading 2"
          onClick={() => run(setBlockType(gardenSchema.nodes.heading, { level: 2 }))}
        >
          H2
        </FormatButton>
        <FormatButton
          label="Bullet list"
          onClick={() => run(wrapInList(gardenSchema.nodes.bulletList))}
        >
          •
        </FormatButton>
        <span className="mx-1 h-4 w-px bg-line" />
        <FormatButton label="Export DOCX" onClick={() => exportFormat("docx")}>
          Export DOCX
        </FormatButton>
        <FormatButton label="Export ODT" onClick={() => exportFormat("odt")}>
          Export ODT
        </FormatButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-bg">
        <div className="mx-auto flex h-full w-full max-w-[46rem] flex-col px-8 py-10">
          <div ref={mountRef} className="min-h-full w-full flex-1" />
        </div>
      </div>
      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-raised px-3 text-[11px] text-faint">
        <span>{words.toLocaleString()} words</span>
        <span>{blocks} blocks</span>
        {selected > 0 && <span className="text-accent">{selected} selected</span>}
      </div>
    </div>
  );
}

function FormatButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-6 min-w-6 items-center justify-center rounded px-1 text-[11px] font-semibold text-muted hover:bg-hover hover:text-ink"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
