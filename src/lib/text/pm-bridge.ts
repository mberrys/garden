import { Node } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import type { PmNode, TextDoc } from "@/lib/docs/schema";
import type { TextOp } from "@/lib/ops/text";
import type { SurfaceSelection } from "@/lib/store/workspace";
import { markdownToDoc } from "./markdown";
import { gardenSchema } from "./pm-schema";

export function emptyPmDoc(): Node {
  return gardenSchema.node("doc", null, [gardenSchema.node("paragraph")]);
}

export function gardenBodyToPm(body: PmNode): Node {
  try {
    const json = body.type === "doc" ? body : { type: "doc", content: [body] };
    return Node.fromJSON(gardenSchema, json);
  } catch {
    return emptyPmDoc();
  }
}

export function pmToGardenBody(node: Node): PmNode {
  return node.toJSON() as PmNode;
}

export function createGardenEditorState(body: PmNode, plugins: EditorState["plugins"] = []): EditorState {
  return EditorState.create({
    schema: gardenSchema,
    doc: gardenBodyToPm(body),
    plugins,
  });
}

export function textOpsFromPmReplace(current: TextDoc, nextDoc: Node): TextOp[] {
  const next = pmToGardenBody(nextDoc);
  const nodes = next.content?.length ? next.content : [{ type: "paragraph" }];
  return [
    {
      op: "spliceBlocks",
      index: 0,
      count: current.body.content?.length ?? 0,
      nodes,
    },
  ];
}

export function pmDocFromMarkdown(markdown: string): Node {
  return gardenBodyToPm(markdownToDoc(markdown));
}

export function selectionFromPm(state: EditorState): Extract<SurfaceSelection, { kind: "text" }> {
  const { from, to } = state.selection;
  const start = state.doc.resolve(from).index(0);
  const end = state.doc.resolve(to).index(0);
  const text = state.doc.textBetween(from, to, "\n");
  return {
    kind: "text",
    blockIndex: start,
    blockCount: from === to ? 0 : Math.max(1, end - start + 1),
    text,
  };
}

export function selectionToPm(state: EditorState, selection: SurfaceSelection): EditorState {
  if (selection.kind !== "text") return state;
  const index = Math.max(0, Math.min(selection.blockIndex, state.doc.childCount - 1));
  let pos = 1;
  for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize;
  const $pos = state.doc.resolve(Math.min(pos, state.doc.content.size));
  return state.apply(state.tr.setSelection(TextSelection.near($pos)));
}

export function engineTextDoc(meta: TextDoc, pmDoc: Node): TextDoc {
  return { ...meta, body: pmToGardenBody(pmDoc) };
}
