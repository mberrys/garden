import "./text.register";
import "./canvas.register";
import "./deck.register";
import "./pdf.register";
import "./sheet.register";

export { registerSurface, getSurface, allSurfaces, allKinds } from "./registry";
export type { SurfaceDefinition } from "./definition";
