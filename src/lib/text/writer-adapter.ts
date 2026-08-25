import { applyOps, type TextOp } from "@/lib/ops";
import type { TextDoc } from "@/lib/docs/schema";
import { createTextDoc } from "@/lib/docs/factories";
import { docToMarkdown } from "@/lib/text/markdown";
import type { EditorAdapter } from "@/lib/surfaces/adapter";
import type { AdapterDriver, TestAdapter } from "@/lib/surfaces/conformance";
import type { SurfaceSelection } from "@/lib/store/workspace";

export type TextIntent = { type: "type"; markdown: string };

/**
 * Writer adapter: ProseMirror-shaped Garden JSON in, replaceDoc ops out.
 * History stays on Garden's stack — this adapter never owns undo.
 */
export function createTextAdapter(): TestAdapter<TextDoc, TextOp, SurfaceSelection, TextIntent> {
  let doc = createTextDoc();
  let selection: SurfaceSelection | null = null;
  let onEdit: ((ops: TextOp[]) => void) | null = null;
  let applying = false;
  const ephemeral = { caretPx: 0 };

  const adapter: EditorAdapter<TextDoc, TextOp, SurfaceSelection> &
    AdapterDriver<TextDoc, TextIntent> = {
    mount(next) {
      doc = structuredClone(next);
    },
    update(next) {
      if (applying) return;
      applying = true;
      doc = structuredClone(next);
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
    },
    dispose() {
      onEdit = null;
      selection = null;
      ephemeral.caretPx = 0;
    },
    simulateUserEdit(intent) {
      if (applying) return;
      const ops: TextOp[] = [{ op: "replaceDoc", markdown: intent.markdown }];
      onEdit?.(ops);
    },
    readEngineDoc() {
      return structuredClone(doc);
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
