import type { ComponentType } from "react";
import type { ZodType } from "zod";
import type { LucideIcon } from "lucide-react";
import type { Doc } from "@/lib/docs/schema";
import type { SurfaceSelection } from "@/lib/store/workspace";
import type { MockRequest } from "@/lib/ai/mock-types";
import type { EditorAdapter } from "./adapter";

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

/**
 * Contract for an `EditorAdapter` implementation and the conformance harness.
 * Product built-ins register through {@link SurfaceDefinition} instead.
 */
export interface AdapterSurfaceDefinition<
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
  /** Product UI host — optional until a surface wires a React host. */
  Host?: ComponentType<{ doc: { kind: Kind; body: Body } }>;
}

/**
 * Everything the app needs to know about a product surface, gathered in one object.
 * Built-in surfaces and future custom surfaces register through the same shape.
 *
 * The `any` in body/doc positions is deliberate: the registry erases the per-
 * surface body type so it can hold all surfaces in one Map. Callers that need
 * type safety narrow through `DocOf<K>` after looking up the definition.
 */
export interface SurfaceDefinition {
  kind: string;
  label: string;
  icon: LucideIcon;
  iconColor: string;

  bodySchema: ZodType;
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
}
