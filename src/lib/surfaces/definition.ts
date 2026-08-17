import type { ComponentType } from "react";
import type { ZodType } from "zod";
import type { EditorAdapter } from "./adapter";

/**
 * Everything a surface contributes to Garden: schemas, reducers, and (later)
 * a React host. Built-in product surfaces will register through this shape in
 * #9; the stub adapter exercises the contract without touching `DocKind`.
 */
export interface SurfaceDefinition<
  Body,
  Op,
  Selection,
  Kind extends string = string,
> {
  kind: Kind;
  label: string;
  bodySchema: ZodType<Body>;
  opSchema: ZodType<Op>;
  selectionSchema: ZodType<Selection>;
  apply: (body: Body, ops: Op[]) => { body: Body; inverse: Op[] };
  createAdapter: () => EditorAdapter<Body, Op, Selection>;
  /** Product UI host — optional until #9 wires surfaces through the registry. */
  Host?: ComponentType<{ doc: { kind: Kind; body: Body } }>;
}

/** Garden document envelope shared by product docs and conformance fixtures. */
export interface GardenDocEnvelope<Kind extends string, Body> {
  id: string;
  kind: Kind;
  title: string;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
  body: Body;
}
