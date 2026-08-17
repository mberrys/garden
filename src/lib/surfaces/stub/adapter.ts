import type { EditorAdapter } from "../adapter";
import { StubEngine } from "./engine";
import type { StubBody, StubOp, StubSelection } from "./schema";

export class StubEditorAdapter implements EditorAdapter<StubBody, StubOp, StubSelection> {
  private engine: StubEngine | null = null;
  private onEdit: ((ops: StubOp[]) => void) | null = null;
  private syncing = false;

  mount(doc: StubBody): void {
    this.engine = StubEngine.fromBody(doc);
  }

  update(doc: StubBody): void {
    if (!this.engine) return;
    this.syncing = true;
    this.engine.syncFromBody(doc);
    this.syncing = false;
  }

  onUserEdit(callback: (ops: StubOp[]) => void): void {
    this.onEdit = callback;
  }

  readSelection(): StubSelection | null {
    return this.engine?.readSelection() ?? null;
  }

  focusSelection(selection: StubSelection): void {
    if (!this.engine) return;
    this.engine.setSelection(selection === null ? null : selection.index);
  }

  dispose(): void {
    this.engine = null;
    this.onEdit = null;
  }

  /** Test hook: simulate the user adding a row through the engine UI. */
  simulateAddItem(text: string): StubOp[] {
    if (!this.engine || this.syncing || !this.onEdit) return [];
    const ops = this.engine.userAddItem(text);
    this.onEdit(ops);
    return ops;
  }

  /** Test hook: simulate toggling the selected row. */
  simulateToggleSelected(): StubOp[] {
    if (!this.engine || this.syncing || !this.onEdit) return [];
    const ops = this.engine.userToggleSelected();
    if (ops.length > 0) this.onEdit(ops);
    return ops;
  }

  /** Test hook: mutate engine internals without emitting Garden ops. */
  mutateEngineOnly(): void {
    this.engine?.mutateEngineOnly();
  }

  /** Test hook: invoke the engine's own undo stack. */
  engineUndo(): void {
    this.engine?.engineUndo();
  }

  /** Test hook: read engine-only state for conformance assertions. */
  engineSnapshot(): ReturnType<StubEngine["snapshot"]> | null {
    return this.engine?.snapshot() ?? null;
  }
}

export function createStubAdapter(): StubEditorAdapter {
  return new StubEditorAdapter();
}
