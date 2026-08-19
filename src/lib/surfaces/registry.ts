import type { DocKind } from "@/lib/docs/schema";
import type { SurfaceDefinition } from "./definition";

const registry = new Map<string, SurfaceDefinition>();

export function registerSurface<K extends DocKind>(def: SurfaceDefinition<K>): void {
  if (registry.has(def.kind)) {
    throw new Error(`Surface "${def.kind}" is already registered`);
  }
  registry.set(def.kind, def as SurfaceDefinition);
}

export function getSurface<K extends DocKind>(kind: K): SurfaceDefinition<K> {
  const def = registry.get(kind);
  if (!def) throw new Error(`Unknown surface kind: "${kind}"`);
  return def as SurfaceDefinition<K>;
}

export function allSurfaces(): SurfaceDefinition[] {
  return Array.from(registry.values());
}

export function allKinds(): DocKind[] {
  return Array.from(registry.keys()) as DocKind[];
}
