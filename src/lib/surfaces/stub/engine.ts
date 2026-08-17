import { nid } from "@/lib/docs/ids";
import type { StubBody, StubItem, StubOp } from "./schema";

/** Fields the fake engine keeps that Garden must never persist. */
export interface StubEngineOnlyState {
  engineUndoStack: StubBody[];
  scrollTop: number;
  ephemeralSessionId: string;
}

export interface StubEngineSnapshot extends StubBody, StubEngineOnlyState {
  selectedIndex: number | null;
}

/**
 * In-memory stand-in for a third-party checklist widget.
 *
 * User gestures mutate this object first; the adapter translates diffs into
 * Garden ops. Engine-only fields exist so conformance can prove they never
 * leak into `serialize()`.
 */
export class StubEngine {
  items: StubItem[] = [];
  selectedIndex: number | null = null;
  engineUndoStack: StubBody[] = [];
  scrollTop = 0;
  ephemeralSessionId = nid("eng");

  static fromBody(body: StubBody): StubEngine {
    const engine = new StubEngine();
    engine.syncFromBody(body);
    return engine;
  }

  syncFromBody(body: StubBody): void {
    this.items = body.items.map((item) => ({ ...item }));
  }

  snapshotBody(): StubBody {
    return { items: this.items.map((item) => ({ ...item })) };
  }

  snapshot(): StubEngineSnapshot {
    return {
      ...this.snapshotBody(),
      selectedIndex: this.selectedIndex,
      engineUndoStack: this.engineUndoStack.map((body) => ({
        items: body.items.map((item) => ({ ...item })),
      })),
      scrollTop: this.scrollTop,
      ephemeralSessionId: this.ephemeralSessionId,
    };
  }

  /** Simulated user gesture: append a checklist row. */
  userAddItem(text: string): StubOp[] {
    const id = nid("item");
    const item: StubItem = { id, text, done: false };
    this.engineUndoStack.push(this.snapshotBody());
    this.items.push(item);
    this.scrollTop += 24;
    return [{ op: "addItem", id, text, done: false }];
  }

  /** Simulated user gesture: toggle done on the selected row. */
  userToggleSelected(): StubOp[] {
    if (this.selectedIndex === null || this.selectedIndex >= this.items.length) return [];
    const item = this.items[this.selectedIndex];
    this.engineUndoStack.push(this.snapshotBody());
    item.done = !item.done;
    return [{ op: "setItem", id: item.id, patch: { done: item.done } }];
  }

  /** Direct engine mutation that bypasses the adapter — must not reach Garden. */
  mutateEngineOnly(): void {
    this.engineUndoStack.push({
      items: [{ id: "ghost", text: "engine-only", done: false }],
    });
    this.scrollTop = 999;
    this.ephemeralSessionId = nid("ghost");
    this.items.push({ id: "uncommitted", text: "never emitted", done: false });
  }

  /** Engine-local undo — conformance proves the session ignores this stack. */
  engineUndo(): void {
    const prev = this.engineUndoStack.pop();
    if (prev) this.items = prev.items.map((item) => ({ ...item }));
  }

  setSelection(index: number | null): void {
    this.selectedIndex = index;
  }

  readSelection(): { index: number } | null {
    if (this.selectedIndex === null) return null;
    return { index: this.selectedIndex };
  }
}
