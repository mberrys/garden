import type { EditorAdapter } from "./definition";
import { createAdapterHost, FeedbackLoopError } from "./host";

/**
 * Test-only surface of an adapter. Production engines implement this in their
 * `*.test.ts`, not in the shipped adapter.
 */
export interface AdapterDriver<Doc, Intent = unknown> {
  /** Fire a gesture the adapter must translate into `onUserEdit` ops. */
  simulateUserEdit(intent: Intent): void;
  /** Engine-side document, not Garden's copy. */
  readEngineDoc(): Doc;
  /** Must be false: Garden's stack is the only undo history. */
  engineOwnsHistory(): boolean;
  /** Ephemeral engine fields that must never appear in `.gardenspace`. */
  readEngineEphemeral(): unknown;
}

export type TestAdapter<Doc, Op, Selection, Intent = unknown> = EditorAdapter<
  Doc,
  Op,
  Selection
> &
  AdapterDriver<Doc, Intent>;

export interface ConformanceSpec<Doc, Op, Selection, Intent = unknown> {
  create: () => TestAdapter<Doc, Op, Selection, Intent>;
  applyOps: (doc: Doc, ops: Op[]) => { doc: Doc; inverse: Op[] };
  serializeDoc: (doc: Doc) => unknown;
  serializeSelection: (selection: Selection) => unknown;
  initialDoc: Doc;
  userEdit: { intent: Intent };
  /** Applied from outside the engine (undo/AI-after-accept). Must change the doc. */
  gardenOps: Op[];
  selection: Selection;
  pendingAiOps: Op[];
}

export const CONFORMANCE_CASES = [
  "userEditsBecomeOps",
  "noFeedbackLoop",
  "gardenOwnsUndo",
  "selectionRoundTrip",
  "aiReviewGate",
  "disposeRemount",
] as const;

export type ConformanceCase = (typeof CONFORMANCE_CASES)[number];

export const CONFORMANCE_LABELS: Record<ConformanceCase, string> = {
  userEditsBecomeOps: "user edits become Garden ops (no silent engine mutations)",
  noFeedbackLoop: "Garden ops update the editor without feedback loops",
  gardenOwnsUndo: "undo is controlled by Garden's stack, not the engine",
  selectionRoundTrip: "selection round-trips through Garden serialization",
  aiReviewGate: "AI review-before-apply gates every batch",
  disposeRemount: "dispose/remount does not leak engine state into Garden serialization",
};

export interface ConformanceFailure {
  case: ConformanceCase;
  message: string;
}

export interface ConformanceReport {
  ok: boolean;
  failures: ConformanceFailure[];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function session<Doc, Op, Selection, Intent>(
  spec: ConformanceSpec<Doc, Op, Selection, Intent>,
) {
  const adapter = spec.create();
  const host = createAdapterHost(adapter, {
    initialDoc: spec.initialDoc,
    applyOps: spec.applyOps,
  });
  return { adapter, host };
}

function checkUserEditsBecomeOps<Doc, Op, Selection, Intent>(
  spec: ConformanceSpec<Doc, Op, Selection, Intent>,
): void {
  const { adapter, host } = session(spec);
  const before = spec.serializeDoc(clone(spec.initialDoc));
  adapter.simulateUserEdit(spec.userEdit.intent);
  if (host.historyLength() === 0) {
    throw new Error("user edit did not produce Garden ops");
  }
  const garden = spec.serializeDoc(host.getDoc());
  const engine = spec.serializeDoc(adapter.readEngineDoc());
  if (!same(garden, engine)) {
    throw new Error("engine diverged from Garden after a user edit (silent engine-owned mutation)");
  }
  if (same(garden, before)) {
    throw new Error("user edit produced ops but Garden state did not change");
  }
  adapter.dispose();
}

function checkNoFeedbackLoop<Doc, Op, Selection, Intent>(
  spec: ConformanceSpec<Doc, Op, Selection, Intent>,
): void {
  const { adapter, host } = session(spec);
  try {
    host.applyExternal(spec.gardenOps);
  } catch (err) {
    if (err instanceof FeedbackLoopError) throw err;
    throw err;
  }
  if (host.historyLength() !== 1) {
    throw new Error(
      `Garden ops should be one history entry; got ${host.historyLength()} (adapter likely re-emitted edits)`,
    );
  }
  const garden = spec.serializeDoc(host.getDoc());
  const engine = spec.serializeDoc(adapter.readEngineDoc());
  if (!same(garden, engine)) {
    throw new Error("engine did not match Garden after an external update");
  }
  adapter.dispose();
}

function checkGardenOwnsUndo<Doc, Op, Selection, Intent>(
  spec: ConformanceSpec<Doc, Op, Selection, Intent>,
): void {
  const { adapter, host } = session(spec);
  if (adapter.engineOwnsHistory()) {
    throw new Error("engine owns undo; Garden's workspace stack must be the only history");
  }
  const before = spec.serializeDoc(host.getDoc());
  adapter.simulateUserEdit(spec.userEdit.intent);
  const edited = spec.serializeDoc(host.getDoc());
  if (same(edited, before)) {
    throw new Error("user edit did not change Garden state; cannot verify undo");
  }
  host.undo();
  if (!same(spec.serializeDoc(host.getDoc()), before)) {
    throw new Error("Garden undo did not restore the document");
  }
  if (!same(spec.serializeDoc(adapter.readEngineDoc()), before)) {
    throw new Error("engine did not follow Garden undo (engine-owned history?)");
  }
  host.redo();
  if (!same(spec.serializeDoc(host.getDoc()), edited)) {
    throw new Error("Garden redo did not restore the edited document");
  }
  if (!same(spec.serializeDoc(adapter.readEngineDoc()), edited)) {
    throw new Error("engine did not follow Garden redo");
  }
  adapter.dispose();
}

function checkSelectionRoundTrip<Doc, Op, Selection, Intent>(
  spec: ConformanceSpec<Doc, Op, Selection, Intent>,
): void {
  const { adapter } = session(spec);
  const expected = spec.serializeSelection(
    JSON.parse(JSON.stringify(spec.selection)) as Selection,
  );
  adapter.focusSelection(clone(spec.selection));
  const read = adapter.readSelection();
  if (read === null) {
    throw new Error("readSelection returned null after focusSelection");
  }
  if (!same(spec.serializeSelection(read), expected)) {
    throw new Error("selection did not round-trip through Garden serialization");
  }
  adapter.dispose();
}

function checkAiReviewGate<Doc, Op, Selection, Intent>(
  spec: ConformanceSpec<Doc, Op, Selection, Intent>,
): void {
  const { adapter, host } = session(spec);
  const beforeGarden = spec.serializeDoc(host.getDoc());
  const beforeEngine = spec.serializeDoc(adapter.readEngineDoc());

  host.proposeAi(spec.pendingAiOps);
  if (host.pendingAi() === null) {
    throw new Error("proposeAi did not store a pending batch");
  }
  if (!same(spec.serializeDoc(host.getDoc()), beforeGarden)) {
    throw new Error("pending AI batch mutated Garden state before accept");
  }
  if (!same(spec.serializeDoc(adapter.readEngineDoc()), beforeEngine)) {
    throw new Error("pending AI batch mutated the engine before accept");
  }

  host.reject();
  if (host.pendingAi() !== null) {
    throw new Error("reject did not drop the pending AI batch");
  }
  if (!same(spec.serializeDoc(host.getDoc()), beforeGarden)) {
    throw new Error("rejecting an AI batch mutated Garden state");
  }
  if (!same(spec.serializeDoc(adapter.readEngineDoc()), beforeEngine)) {
    throw new Error("rejecting an AI batch mutated the engine");
  }

  host.proposeAi(spec.pendingAiOps);
  host.accept();
  if (host.pendingAi() !== null) {
    throw new Error("accept left a pending AI batch in place");
  }
  const after = spec.serializeDoc(host.getDoc());
  if (same(after, beforeGarden)) {
    throw new Error("accepting an AI batch did not change Garden state");
  }
  if (!same(spec.serializeDoc(adapter.readEngineDoc()), after)) {
    throw new Error("engine did not receive the accepted AI batch via update");
  }
  adapter.dispose();
}

function checkDisposeRemount<Doc, Op, Selection, Intent>(
  spec: ConformanceSpec<Doc, Op, Selection, Intent>,
): void {
  const { adapter, host } = session(spec);
  adapter.simulateUserEdit(spec.userEdit.intent);
  const dirtyEphemeral = adapter.readEngineEphemeral();
  const serialized = spec.serializeDoc(host.getDoc());
  const blob = JSON.stringify(serialized);
  const ephemeralBlob = JSON.stringify(dirtyEphemeral);
  if (ephemeralBlob && ephemeralBlob !== "{}" && blob.includes(ephemeralBlob)) {
    throw new Error("serializeDoc embeds engine ephemeral state (would leak into .gardenspace)");
  }

  adapter.dispose();
  const remounted = spec.create();
  const roundTripped = JSON.parse(JSON.stringify(serialized)) as Doc;
  const remountHost = createAdapterHost(remounted, {
    initialDoc: roundTripped,
    applyOps: spec.applyOps,
  });
  if (!same(spec.serializeDoc(remounted.readEngineDoc()), spec.serializeDoc(roundTripped))) {
    throw new Error("remount did not restore Garden state");
  }
  if (!same(spec.serializeDoc(remountHost.getDoc()), spec.serializeDoc(roundTripped))) {
    throw new Error("remounted Garden host diverged from serialized state");
  }
  if (same(remounted.readEngineEphemeral(), dirtyEphemeral)) {
    throw new Error("dispose/remount restored engine ephemeral state");
  }
  remounted.dispose();
}

const CHECKS: { [K in ConformanceCase]: <D, O, S, I>(spec: ConformanceSpec<D, O, S, I>) => void } = {
  userEditsBecomeOps: checkUserEditsBecomeOps,
  noFeedbackLoop: checkNoFeedbackLoop,
  gardenOwnsUndo: checkGardenOwnsUndo,
  selectionRoundTrip: checkSelectionRoundTrip,
  aiReviewGate: checkAiReviewGate,
  disposeRemount: checkDisposeRemount,
};

export function runConformanceCase<Doc, Op, Selection, Intent>(
  name: ConformanceCase,
  spec: ConformanceSpec<Doc, Op, Selection, Intent>,
): void {
  CHECKS[name](spec);
}

/**
 * Register one vitest/playwright `it` (or equivalent) per conformance case.
 *
 * ```ts
 * describe("writer adapter", () => {
 *   runAdapterConformance(writerSpec, it);
 * });
 * ```
 */
export function runAdapterConformance<Doc, Op, Selection, Intent>(
  spec: ConformanceSpec<Doc, Op, Selection, Intent>,
  test: (name: string, fn: () => void) => void,
): void {
  for (const name of CONFORMANCE_CASES) {
    test(CONFORMANCE_LABELS[name], () => {
      runConformanceCase(name, spec);
    });
  }
}

export function evaluateAdapterConformance<Doc, Op, Selection, Intent>(
  spec: ConformanceSpec<Doc, Op, Selection, Intent>,
): ConformanceReport {
  const failures: ConformanceFailure[] = [];
  for (const name of CONFORMANCE_CASES) {
    try {
      runConformanceCase(name, spec);
    } catch (err) {
      failures.push({
        case: name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { ok: failures.length === 0, failures };
}
