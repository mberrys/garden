import type { Doc } from "@/lib/docs/schema";
import type { SurfaceSelection } from "@/lib/store/workspace";
import { getSurface } from "@/lib/surfaces/registry";

export interface MockRequest {
  doc: Doc;
  request: string;
  selection?: SurfaceSelection;
  companions?: { doc: Doc }[];
}

export function mockReply(request: MockRequest): string {
  return getSurface(request.doc.kind).mockReply(request);
}

/**
 * Streams a scripted reply in chunks so the UI exercises the same incremental
 * rendering path a real model drives.
 */
export async function* streamMockReply(
  request: MockRequest,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const text = mockReply(request);
  const chunks = text.match(/[\s\S]{1,24}/g) ?? [];
  for (const chunk of chunks) {
    if (signal?.aborted) return;
    await new Promise((resolve) => setTimeout(resolve, 12));
    yield chunk;
  }
}
