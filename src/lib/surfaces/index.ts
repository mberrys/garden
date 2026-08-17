import "./text.register";
import "./canvas.register";
import "./deck.register";
import "./pdf.register";

export { registerSurface, getSurface, allSurfaces, allKinds } from "./registry";
export type { SurfaceDefinition } from "./definition";
