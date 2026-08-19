import type { Doc } from "@/lib/docs/schema";
import type { SurfaceSelection } from "@/lib/store/workspace";

export interface MockRequest {
  doc: Doc;
  request: string;
  selection?: SurfaceSelection;
  companions?: { doc: Doc }[];
}
