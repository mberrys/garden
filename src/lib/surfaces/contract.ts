import type { ComponentType } from "react";
import type { z } from "zod";

/**
 * Architectural rule: Garden owns the document model, operations, AI review
 * gate, undo semantics, workspace, and `.gardenspace`. Open-source editor
 * engines are renderer/input devices for that state — never the product model.
 *
 * `SurfaceDefinition` is the registration contract a surface will hang off
 * (issue #9). `EditorAdapter` is the engine boundary (issue #31): user input
 * becomes Garden ops, Garden ops update the engine, and replacing Univer or
 * ProseMirror later must not change the AI vocabulary or the on-disk format.
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

/** Envelope shape shared by Garden documents. Adapter `Doc` types should match. */
export interface SurfaceDoc<Kind extends string = string, Body = unknown> {
  id: string;
  kind: Kind;
  title: string;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
  body: Body;
}

export interface ApplyOpsResult<Body, Op> {
  body: Body;
  inverse: Op[];
}

/**
 * Registration contract for a surface: schema, ops, reducer, optional UI host,
 * optional engine adapter. Built-ins can be *described* against this before they
 * all implement it; a fifth surface should eventually register one of these
 * instead of growing another `switch (kind)` in the shell.
 */
export interface SurfaceDefinition<
  Kind extends string = string,
  Body = unknown,
  Op = unknown,
  Selection = unknown,
  Doc = SurfaceDoc<Kind, Body>,
> {
  kind: Kind;
  label: string;
  bodySchema: z.ZodType<Body>;
  opSchema: z.ZodType<Op>;
  applyOps: (body: Body, ops: Op[]) => ApplyOpsResult<Body, Op>;
  /** Optional contribution to the assistant's operation reference. */
  opReference?: string;
  /**
   * React host for the surface. Type-only here so the contract stays runnable
   * under Node (the #9 registry will attach real components).
   */
  Host?: ComponentType<{ doc: Doc }>;
  /** Present when the surface borrows an editor engine. Garden-owned UIs omit it. */
  createAdapter?: () => EditorAdapter<Doc, Op, Selection>;
}
