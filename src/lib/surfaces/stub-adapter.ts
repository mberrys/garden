import { z } from "zod";
import type { EditorAdapter } from "./definition";
import type { AdapterDriver } from "./conformance";

/**
 * Toy notes list used only to prove the adapter contract. Not a product
 * `DocKind` — it never enters the workspace or `.gardenspace`, so it does not
 * register through `registerSurface`/`SurfaceDefinition` (that contract is
 * keyed to the real `DocKind` union). `StubSurfaceDescription` below is a
 * standalone shape scoped to exactly what this file needs.
 */

/** Minimal description of a registrable surface, for the stub's own use only. */
export interface StubSurfaceDescription<Body, Op> {
  kind: "stub";
  label: string;
  bodySchema: z.ZodType<Body>;
  opSchema: z.ZodType<Op>;
  applyOps: (body: Body, ops: Op[]) => { body: Body; inverse: Op[] };
  /** Sample text for what a real registration's generated op reference would say. */
  opReference: string;
  createAdapter: () => EditorAdapter<StubDoc, Op, StubSelection>;
}

export const StubBodySchema = z.object({
  title: z.string(),
  items: z.array(z.string()),
});
export type StubBody = z.infer<typeof StubBodySchema>;

export const StubOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("setTitle"), title: z.string() }),
  z.object({
    op: z.literal("insertItem"),
    index: z.number().int().min(0),
    text: z.string(),
  }),
  z.object({ op: z.literal("removeItem"), index: z.number().int().min(0) }),
]);
export type StubOp = z.infer<typeof StubOpSchema>;

export const StubSelectionSchema = z.discriminatedUnion("target", [
  z.object({ target: z.literal("title") }),
  z.object({ target: z.literal("item"), index: z.number().int().min(0) }),
]);
export type StubSelection = z.infer<typeof StubSelectionSchema>;

export interface StubDoc {
  id: string;
  kind: "stub";
  title: string;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
  body: StubBody;
}

export type StubIntent =
  | { type: "setTitle"; title: string }
  | { type: "appendItem"; text: string }
  | { type: "removeItem"; index: number };

export interface StubEphemeral {
  cursorPx: number;
  draft: string;
}

export function createStubDoc(title = "Notes"): StubDoc {
  return {
    id: "stub_doc",
    kind: "stub",
    title,
    createdAt: 0,
    updatedAt: 0,
    schemaVersion: 1,
    body: { title, items: [] },
  };
}

export function serializeStubDoc(doc: StubDoc): unknown {
  return {
    id: doc.id,
    kind: doc.kind,
    title: doc.title,
    body: { title: doc.body.title, items: [...doc.body.items] },
  };
}

export function serializeStubSelection(selection: StubSelection): unknown {
  return JSON.parse(JSON.stringify(selection)) as unknown;
}

export function applyStubBodyOps(body: StubBody, ops: StubOp[]): { body: StubBody; inverse: StubOp[] } {
  let title = body.title;
  const items = body.items.slice();
  const inverse: StubOp[] = [];

  for (const op of ops) {
    switch (op.op) {
      case "setTitle":
        inverse.push({ op: "setTitle", title });
        title = op.title;
        break;
      case "insertItem": {
        if (op.index < 0 || op.index > items.length) {
          throw new Error(`insertItem: index ${op.index} is out of range (${items.length} items)`);
        }
        items.splice(op.index, 0, op.text);
        inverse.push({ op: "removeItem", index: op.index });
        break;
      }
      case "removeItem": {
        if (op.index < 0 || op.index >= items.length) {
          throw new Error(`removeItem: index ${op.index} is out of range (${items.length} items)`);
        }
        const text = items[op.index];
        if (text === undefined) {
          throw new Error(`removeItem: index ${op.index} is out of range (${items.length} items)`);
        }
        items.splice(op.index, 1);
        inverse.push({ op: "insertItem", index: op.index, text });
        break;
      }
      default: {
        const never: never = op;
        throw new Error(`unknown stub op: ${JSON.stringify(never)}`);
      }
    }
  }

  return { body: { title, items }, inverse: inverse.reverse() };
}

export function applyStubDocOps(doc: StubDoc, ops: StubOp[]): { doc: StubDoc; inverse: StubOp[] } {
  const result = applyStubBodyOps(doc.body, ops);
  return {
    doc: {
      ...doc,
      title: result.body.title,
      body: result.body,
      updatedAt: doc.updatedAt + 1,
    },
    inverse: result.inverse,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function fingerprint(doc: StubDoc): string {
  return JSON.stringify(serializeStubDoc(doc));
}

function intentToOps(doc: StubDoc, intent: StubIntent): StubOp[] {
  switch (intent.type) {
    case "setTitle":
      return [{ op: "setTitle", title: intent.title }];
    case "appendItem":
      return [{ op: "insertItem", index: doc.body.items.length, text: intent.text }];
    case "removeItem":
      return [{ op: "removeItem", index: intent.index }];
    default: {
      const never: never = intent;
      throw new Error(`unknown stub intent: ${JSON.stringify(never)}`);
    }
  }
}

const EMPTY_EPHEMERAL: StubEphemeral = { cursorPx: 0, draft: "" };

export interface StubAdapter
  extends EditorAdapter<StubDoc, StubOp, StubSelection>, AdapterDriver<StubDoc, StubIntent> {}

class StubNotesAdapter implements StubAdapter {
  private engineDoc: StubDoc = createStubDoc();
  private selection: StubSelection | null = null;
  private callback: ((ops: StubOp[]) => void) | null = null;
  private lastPushed = "";
  private ephemeral: StubEphemeral = { ...EMPTY_EPHEMERAL };

  mount(doc: StubDoc): void {
    this.engineDoc = clone(doc);
    this.lastPushed = fingerprint(this.engineDoc);
    this.selection = { target: "title" };
    this.ephemeral = { ...EMPTY_EPHEMERAL };
  }

  update(doc: StubDoc): void {
    const incoming = fingerprint(doc);
    if (incoming === this.lastPushed) return;
    this.engineDoc = clone(doc);
    this.lastPushed = incoming;
  }

  onUserEdit(callback: (ops: StubOp[]) => void): void {
    this.callback = callback;
  }

  readSelection(): StubSelection | null {
    return this.selection ? clone(this.selection) : null;
  }

  focusSelection(selection: StubSelection): void {
    this.selection = clone(selection);
  }

  dispose(): void {
    this.callback = null;
    this.engineDoc = createStubDoc();
    this.selection = null;
    this.lastPushed = "";
    this.ephemeral = { ...EMPTY_EPHEMERAL };
  }

  simulateUserEdit(intent: StubIntent): void {
    const ops = intentToOps(this.engineDoc, intent);
    const result = applyStubDocOps(this.engineDoc, ops);
    this.engineDoc = result.doc;
    this.lastPushed = fingerprint(this.engineDoc);
    this.ephemeral = {
      cursorPx: this.ephemeral.cursorPx + 13,
      draft: `draft:${intent.type}`,
    };
    this.callback?.(ops);
  }

  readEngineDoc(): StubDoc {
    return clone(this.engineDoc);
  }

  engineOwnsHistory(): boolean {
    return false;
  }

  readEngineEphemeral(): StubEphemeral {
    return { ...this.ephemeral };
  }
}

export function createStubAdapter(): StubAdapter {
  return new StubNotesAdapter();
}

export const STUB_SURFACE: StubSurfaceDescription<StubBody, StubOp> = {
  kind: "stub",
  label: "Stub notes",
  bodySchema: StubBodySchema,
  opSchema: StubOpSchema,
  applyOps: applyStubBodyOps,
  opReference: [
    '- {"op": "setTitle", title: string} — rename the notes document',
    '- {"op": "insertItem", index: number, text: string} — insert a note',
    '- {"op": "removeItem", index: number} — delete a note',
  ].join("\n"),
  createAdapter: createStubAdapter,
};
