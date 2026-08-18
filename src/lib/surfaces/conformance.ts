import { expect, it } from "vitest";
import type { EditorAdapter } from "./adapter";
import type { GardenDocEnvelope, AdapterSurfaceDefinition } from "./definition";
import { createAdapterSession, type AdapterSession } from "./session";

export interface AdapterConformanceHooks<
  Kind extends string,
  Body,
  Op,
  Selection,
  Doc extends GardenDocEnvelope<Kind, Body>,
  AdapterExtra = unknown,
> {
  definition: AdapterSurfaceDefinition<Body, Op, Selection, Kind>;
  createInitialDoc: () => Doc;
  getAdapter: (
    session: AdapterSession<Kind, Body, Op, Selection, Doc>,
  ) => EditorAdapter<Body, Op, Selection> & AdapterExtra;
  simulateUserEdit: (
    session: AdapterSession<Kind, Body, Op, Selection, Doc>,
    adapter: EditorAdapter<Body, Op, Selection> & AdapterExtra,
  ) => Op[];
  mutateEngineOnly: (adapter: EditorAdapter<Body, Op, Selection> & AdapterExtra) => void;
  engineUndo: (adapter: EditorAdapter<Body, Op, Selection> & AdapterExtra) => void;
  sampleSelection: Selection;
  sampleAiOps: (doc: Doc) => Op[];
}

/**
 * Shared conformance suite for `EditorAdapter` implementations.
 *
 * Future Writer/Sheets/Slides adapters should call this from their own
 * `*.test.ts` and fail until every case passes.
 */
export function runAdapterConformance<
  Kind extends string,
  Body,
  Op,
  Selection,
  Doc extends GardenDocEnvelope<Kind, Body>,
  AdapterExtra = unknown,
>(hooks: AdapterConformanceHooks<Kind, Body, Op, Selection, Doc, AdapterExtra>): void {
  const { definition } = hooks;

  it("user edits become Garden ops", () => {
    const session = createAdapterSession(definition, hooks.createInitialDoc());
    const adapter = hooks.getAdapter(session);
    const before = session.serialize();

    hooks.mutateEngineOnly(adapter);
    expect(session.serialize().body).toEqual(before.body);

    const emitted = hooks.simulateUserEdit(session, adapter);
    expect(emitted.length).toBeGreaterThan(0);
    for (const op of emitted) {
      expect(definition.opSchema.safeParse(op).success).toBe(true);
    }

    const after = session.getDoc();
    const roundTrip = definition.apply(before.body, emitted);
    expect(after.body).toEqual(roundTrip.body);
    session.dispose();
  });

  it("does not feedback-loop on update", () => {
    const session = createAdapterSession(definition, hooks.createInitialDoc());
    const adapter = hooks.getAdapter(session);
    const edits: Op[][] = [];

    adapter.onUserEdit((ops) => edits.push(ops));
    session.getAdapter().update(session.getDoc().body);
    expect(edits).toHaveLength(0);
    session.dispose();
  });

  it("Garden owns undo, not the engine", () => {
    const session = createAdapterSession(definition, hooks.createInitialDoc());
    const adapter = hooks.getAdapter(session);
    const before = session.serialize();

    hooks.simulateUserEdit(session, adapter);
    hooks.engineUndo(adapter);

    expect(session.canUndo()).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.getDoc().body).toEqual(before.body);
    session.dispose();
  });

  it("round-trips selection through the schema", () => {
    const session = createAdapterSession(definition, hooks.createInitialDoc());
    const adapter = hooks.getAdapter(session);

    adapter.focusSelection(hooks.sampleSelection);
    const read = adapter.readSelection();
    expect(read).toEqual(hooks.sampleSelection);

    const parsed = definition.selectionSchema.safeParse(JSON.parse(JSON.stringify(read)));
    expect(parsed.success).toBe(true);
    session.dispose();
  });

  it("gates AI proposals until accept", () => {
    const session = createAdapterSession(definition, hooks.createInitialDoc());
    const adapter = hooks.getAdapter(session);
    const before = session.serialize();
    const updates: Body[] = [];

    const originalUpdate = adapter.update.bind(adapter);
    adapter.update = (body: Body) => {
      updates.push(structuredClone(body));
      originalUpdate(body);
    };

    const aiOps = hooks.sampleAiOps(before);
    session.proposeAi(aiOps);
    expect(session.hasPendingAi()).toBe(true);
    expect(updates).toHaveLength(0);
    expect(session.getDoc().body).toEqual(before.body);

    expect(session.acceptAi()).toBe(true);
    expect(session.hasPendingAi()).toBe(false);
    expect(session.getDoc().body).not.toEqual(before.body);
    expect(updates.length).toBeGreaterThan(0);

    const rejectSession = createAdapterSession(definition, hooks.createInitialDoc());
    const rejectBefore = rejectSession.serialize();
    rejectSession.proposeAi(hooks.sampleAiOps(rejectBefore));
    rejectSession.rejectAi();
    expect(rejectSession.getDoc().body).toEqual(rejectBefore.body);
    rejectSession.dispose();
    session.dispose();
  });

  it("drops engine state on dispose and remount", () => {
    const session = createAdapterSession(definition, hooks.createInitialDoc());
    const adapter = hooks.getAdapter(session);

    hooks.simulateUserEdit(session, adapter);
    hooks.mutateEngineOnly(adapter);

    const garden = session.serialize();
    session.remount();

    const nextAdapter = hooks.getAdapter(session);
    const engine = (
      nextAdapter as {
        engineSnapshot?: () => { engineUndoStack: unknown[]; scrollTop: number };
      }
    ).engineSnapshot?.();

    expect(session.getDoc().body).toEqual(garden.body);
    expect(session.serialize()).toEqual(garden);
    if (engine) {
      expect(engine.engineUndoStack).toEqual([]);
      expect(engine.scrollTop).toBe(0);
    }
    session.dispose();
  });
}
