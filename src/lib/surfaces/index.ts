import "./text.register";
import "./canvas.register";
import "./deck.register";
import "./pdf.register";

export { registerSurface, unregisterSurface, getSurface, allSurfaces, allKinds } from "./registry";
export type {
  SurfaceDefinition,
  AdapterSurfaceDefinition,
  GardenDocEnvelope,
} from "./definition";
export { BUILTIN_SURFACE_CONTRACTS } from "./builtins";
