import type { ComponentType } from "react";
import type { ZodType } from "zod";
import type { LucideIcon } from "lucide-react";
import type { Doc, DocKind } from "@/lib/docs/schema";
import type { SurfaceSelection } from "@/lib/store/workspace";
import type { MockRequest } from "@/lib/ai/mock";

/**
 * Translate an external editor engine into Garden semantics (issue #31).
 *
 * The engine may keep ephemeral UI state (caret pixel, scroll, drag preview).
 * Canonical document state, selection that AI/undo care about, and history
 * live on the Garden side of this boundary — never the engine's.
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

/**
 * Everything the app needs to know about a surface, gathered in one object.
 * Built-in surfaces and future custom surfaces register through the same shape.
 *
 * The `any` in body/doc positions is deliberate: the registry erases the per-
 * surface body type so it can hold all surfaces in one Map. Callers that need
 * type safety narrow through `DocOf<K>` after looking up the definition.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SurfaceDefinition<K extends DocKind = any> {
  kind: K;
  label: string;
  icon: LucideIcon;
  iconColor: string;

  opSchema: ZodType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyOps: (body: any, ops: any[]) => { body: any; inverse: any[] };
  createDoc: (title?: string) => Doc;
  ownsHistory: boolean;

  contextBudget: number;
  promptNotes: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serializeDoc: (doc: any, selection?: SurfaceSelection) => string;
  describeSelection: (selection: SurfaceSelection) => string | null;
  mockReply: (request: MockRequest) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  describeOp: (op: any) => string | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  referencedBlobIds: (doc: any) => Set<string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  remapBlobIds: (doc: any, map: Map<string, string>) => any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadComponent: () => Promise<{ default: ComponentType<any> }>;

  /**
   * Present when the surface borrows an external editor engine instead of a
   * Garden-owned React host (issue #31). Garden-owned UIs — the common case —
   * omit this entirely; canonical state, undo and the AI review gate stay on
   * the Garden side regardless of whether an adapter is present.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createAdapter?: () => EditorAdapter<any, any, any>;
}
