/**
 * Architectural rule: Garden owns the document model, operations, AI review
 * gate, undo semantics, workspace, and `.gardenspace`. Open-source editor
 * engines are renderer/input devices for that state — never the product model.
 *
 * `SurfaceDefinition` (issue #9) is the registration contract. `EditorAdapter`
 * (issue #31) is the engine boundary: user input becomes Garden ops, Garden ops
 * update the engine, and replacing Univer or ProseMirror later must not change
 * the AI vocabulary or the on-disk format.
 */

/**
 * Translate an external editor into Garden semantics.
 *
 * The engine may keep ephemeral UI state (caret pixel, scroll, drag preview).
 * Canonical document state, selection that AI/undo care about, and history
 * live on the Garden side of this boundary.
 */
export interface EditorAdapter<Doc, Op, Selection> {
  /** Bind the engine to a Garden document. Must not emit user edits. */
  mount(doc: Doc): void;
  /** Push canonical Garden state into the engine. Must not emit user edits. */
  update(doc: Doc): void;
  /** Translate editor-native input back into Garden operations. */
  onUserEdit(callback: (ops: Op[]) => void): void;
  readSelection(): Selection | null;
  focusSelection(selection: Selection): void;
  /** Drop engine state. A remount must start from Garden, not leftovers. */
  dispose(): void;
}
