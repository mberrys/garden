import type { Doc, DocKind } from "./schema";
import { getSurface } from "@/lib/surfaces";

/** Creates a new document through the surface registry (avoids factories ↔ registry cycles). */
export function createDoc(kind: DocKind, title?: string): Doc {
  return getSurface(kind).createDoc(title);
}
