import type { SurfaceDefinition } from "../definition";
import { createStubAdapter } from "./adapter";
import { applyStubOps } from "./ops";
import {
  STUB_KIND,
  StubBodySchema,
  StubOpSchema,
  StubSelectionSchema,
  type StubBody,
  type StubOp,
  type StubSelection,
} from "./schema";

export const stubSurfaceDefinition: SurfaceDefinition<
  StubBody,
  StubOp,
  StubSelection,
  typeof STUB_KIND
> = {
  kind: STUB_KIND,
  label: "Stub checklist",
  bodySchema: StubBodySchema,
  opSchema: StubOpSchema,
  selectionSchema: StubSelectionSchema,
  apply: applyStubOps,
  createAdapter: createStubAdapter,
};

export { createStubAdapter, StubEditorAdapter } from "./adapter";
export { StubEngine } from "./engine";
export { applyStubOps } from "./ops";
export {
  createStubDoc,
  STUB_KIND,
  StubBodySchema,
  StubDocSchema,
  StubOpSchema,
  StubSelectionSchema,
  type StubBody,
  type StubDoc,
  type StubItem,
  type StubOp,
  type StubSelection,
} from "./schema";
