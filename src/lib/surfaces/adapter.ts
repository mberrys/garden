/**
 * Engine boundary for a surface.
 *
 * An `EditorAdapter` wraps a third-party editor (or a test double) and
 * translates between Garden's typed document body and the engine's internals.
 * Garden owns history, AI review, and persistence — the adapter is a renderer
 * and input device, not a second source of truth.
 */
export interface EditorAdapter<Doc, Op, Selection> {
  mount(doc: Doc): void;
  update(doc: Doc): void;
  onUserEdit(callback: (ops: Op[]) => void): void;
  readSelection(): Selection | null;
  focusSelection(selection: Selection): void;
  dispose(): void;
}
