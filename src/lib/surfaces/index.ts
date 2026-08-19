import "./text.register";
import "./canvas.register";
import "./deck.register";
import "./pdf.register";
import "./sheet.register";

export { registerSurface, getSurface, allSurfaces, allKinds } from "./registry";
export type { SurfaceDefinition, EditorAdapter } from "./definition";
export {
  BUILTIN_SURFACES,
  type AdapterStatus,
  type BuiltinSurfaceDescription,
  type EngineOwnership,
} from "./catalog";
export {
  CONFORMANCE_CASES,
  CONFORMANCE_LABELS,
  evaluateAdapterConformance,
  runAdapterConformance,
  runConformanceCase,
  type AdapterDriver,
  type ConformanceCase,
  type ConformanceFailure,
  type ConformanceReport,
  type ConformanceSpec,
  type TestAdapter,
} from "./conformance";
export { createAdapterHost, FeedbackLoopError, type AdapterHost } from "./host";
export {
  STUB_SURFACE,
  applyStubBodyOps,
  applyStubDocOps,
  createStubAdapter,
  createStubDoc,
  serializeStubDoc,
  serializeStubSelection,
  type StubAdapter,
  type StubBody,
  type StubDoc,
  type StubIntent,
  type StubOp,
  type StubSelection,
} from "./stub-adapter";
