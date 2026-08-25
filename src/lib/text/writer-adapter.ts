import { applyOps, type TextOp } from "@/lib/ops";
import type { TextDoc } from "@/lib/docs/schema";
import { createTextDoc } from "@/lib/docs/factories";
import { docToMarkdown } from "@/lib/text/markdown";
import type { EditorAdapter } from "@/lib/surfaces/adapter";
import type { AdapterDriver, TestAdapter } from "@/lib/surfaces/conformance";
import type { SurfaceSelection } from "@/lib/store/workspace";
import type { EditorState } from "prosemirror-state";
import {
  createGardenEditorState,
  engineTextDoc,
  pmDocFromMarkdown,
  selectionFromPm,
  selectionToPm,
  textOpsFromPmReplace,
} from "./pm-bridge";

export type TextIntent = { type: "type"; markdown: string };

/**
 * Writer adapter: a live ProseMirror `EditorState` in, Garden text ops out.
 * History stays on Garden's stack — this adapter never loads `prosemirror-history`.
 */
export function createTextAdapter(): TestAdapter<TextDoc, TextOp, SurfaceSelection, TextIntent> {
  let meta = createTextDoc();
  let state: EditorState = createGardenEditorState(meta.body);
  let selection: SurfaceSelection | null = null;
  let onEdit: ((ops: TextOp[]) => void) | null = null;
  let applying = false;
  const ephemeral = { caretPx: 0 };

  function load(next: TextDoc): void {
    meta = structuredClone(next);
    state = createGardenEditorState(next.body);
    selection = selectionFromPm(state);
  }

  const adapter: EditorAdapter<TextDoc, TextOp, SurfaceSelection> &
    AdapterDriver<TextDoc, TextIntent> = {
    mount(next) {
      load(next);
    },
    update(next) {
      if (applying) return;
      applying = true;
      load(next);
      applying = false;
    },
    onUserEdit(callback) {
      onEdit = callback;
    },
    readSelection() {
      return selection;
    },
    focusSelection(next) {
      selection = next;
      state = selectionToPm(state, next);
    },
    dispose() {
      onEdit = null;
      selection = null;
      ephemeral.caretPx = 0;
      state = createGardenEditorState({ type: "doc", content: [{ type: "paragraph" }] });
    },
    simulateUserEdit(intent) {
      if (applying) return;
      ephemeral.caretPx += 13;
      const nextPm = pmDocFromMarkdown(intent.markdown);
      const tr = state.tr.replaceWith(0, state.doc.content.size, nextPm.content);
      state = state.apply(tr);
      selection = selectionFromPm(state);
      onEdit?.(textOpsFromPmReplace(meta, state.doc));
    },
    readEngineDoc() {
      return engineTextDoc(meta, state.doc);
    },
    engineOwnsHistory() {
      return false;
    },
    readEngineEphemeral() {
      return { caretPx: ephemeral.caretPx };
    },
  };

  return adapter;
}

export function applyTextAdapterOps(doc: TextDoc, ops: TextOp[]): { doc: TextDoc; inverse: TextOp[] } {
  return applyOps(doc, ops);
}

export function serializeTextAdapterDoc(doc: TextDoc): unknown {
  return { id: doc.id, kind: doc.kind, body: doc.body };
}

export function serializeTextSelection(selection: SurfaceSelection): unknown {
  return JSON.parse(JSON.stringify(selection)) as unknown;
}

export function gardenMarkdownOf(doc: TextDoc): string {
  return docToMarkdown(doc.body);
}
