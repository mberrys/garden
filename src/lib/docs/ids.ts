/**
 * Short, sortable-enough, collision-resistant ids.
 *
 * Deliberately not UUIDs: these ids end up inside AI prompts (the model has to
 * read and echo them back when it emits ops), and 36-character UUIDs burn an
 * absurd share of a small local model's context window for no benefit.
 */

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/** `nid('nd')` -> `nd_k3f9a1x2`. */
export function nid(prefix: string, length = 8): string {
  const bytes = randomBytes(length);
  let s = "";
  for (let i = 0; i < length; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}_${s}`;
}

export const newDocId = () => nid("doc");
export const newNodeId = () => nid("nd");
export const newSlideId = () => nid("sl");
export const newElementId = () => nid("el");
export const newAnnotationId = () => nid("an");
export const newBlobId = () => nid("blob");
export const newMessageId = () => nid("msg");
export const newSuggestionId = () => nid("sug");
