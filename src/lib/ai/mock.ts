import type { MockRequest } from "./mock-types";
import { getSurface } from "@/lib/surfaces";

/**
 * Scripted stand-in for a local model.
 *
 * Used when no local server is reachable, and forced on in the e2e suite. It is
 * not a language model and does not pretend to be one — it pattern-matches the
 * request and returns a canned but *schema-valid* op batch for the surface, so
 * every AI path in the app (streaming, parsing, validation, review, accept,
 * reject, undo) is exercisable with nothing installed.
 *
 * It reads the real document, so the ops it emits reference real ids and apply
 * cleanly. Replies are clearly labelled as scripted in the UI.
 */

export type { MockRequest } from "./mock-types";

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
