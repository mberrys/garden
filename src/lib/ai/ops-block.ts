import type { DocKind } from "@/lib/docs/schema";
import { parseOps, type OpOf } from "@/lib/ops";

/**
 * The wire format for AI-authored edits.
 *
 * Edits arrive as a fenced ```garden-ops block containing a JSON array, not as
 * OpenAI tool calls. That is a deliberate choice for local models: tool-calling
 * support across llama.cpp, Ollama and LM Studio is inconsistent and frequently
 * emits malformed arguments, whereas every instruct-tuned model can reliably
 * produce a fenced JSON block. It also streams — the prose renders while the
 * block is still arriving.
 */

export const OPS_FENCE = "garden-ops";

const FENCE_RE = /```garden-ops\s*\n([\s\S]*?)(?:```|$)/g;

export interface ExtractedBlock {
  /** The raw JSON text inside the fence. */
  json: string;
  /** True when the closing fence has not arrived yet (still streaming). */
  partial: boolean;
}

export function extractOpsBlocks(text: string): ExtractedBlock[] {
  const blocks: ExtractedBlock[] = [];
  FENCE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCE_RE.exec(text)) !== null) {
    blocks.push({ json: match[1], partial: !match[0].endsWith("```") });
  }
  return blocks;
}

/** The assistant's prose with any ops blocks stripped out. */
export function stripOpsBlocks(text: string): string {
  return text.replace(FENCE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

export type ParseOutcome<K extends DocKind> =
  | { status: "none" }
  | { status: "ok"; ops: OpOf<K>[] }
  | { status: "invalid"; errors: string[]; raw: string };

/**
 * Pulls operations out of a completed model reply and validates them against
 * the target surface's schema. Anything that does not validate is reported, not
 * repaired locally — the caller decides whether to ask the model to fix it.
 */
export function parseOpsFromReply<K extends DocKind>(kind: K, text: string): ParseOutcome<K> {
  const blocks = extractOpsBlocks(text).filter((b) => !b.partial);
  if (blocks.length === 0) return { status: "none" };

  const collected: OpOf<K>[] = [];
  const errors: string[] = [];
  const raw = blocks.map((b) => b.json).join("\n");

  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripTrailingCommas(block.json));
    } catch (err) {
      errors.push(`the block is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    // A single operation object instead of an array is a common near-miss and
    // is unambiguous, so accept it rather than bouncing it back to the model.
    const asArray = Array.isArray(parsed) ? parsed : [parsed];
    const result = parseOps(kind, asArray);
    if (result.ok) collected.push(...result.ops);
    else errors.push(...result.errors);
  }

  if (errors.length) return { status: "invalid", errors, raw };
  if (collected.length === 0) return { status: "none" };
  return { status: "ok", ops: collected };
}

/** Small models routinely leave a trailing comma before a closing bracket. */
function stripTrailingCommas(json: string): string {
  return json.replace(/,(\s*[}\]])/g, "$1");
}
