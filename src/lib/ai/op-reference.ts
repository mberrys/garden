import type { ZodType } from "zod";
import type { DocKind } from "@/lib/docs/schema";
import { getSurface } from "@/lib/surfaces";

/**
 * Renders a surface's operation vocabulary as prompt text, generated from the
 * Zod schemas themselves.
 *
 * Hand-written prompt documentation drifts from the validator the moment either
 * changes, and the failure mode is nasty: the model follows the prompt, the
 * validator rejects it, and the user sees "the AI keeps failing" with no clue
 * why. Deriving the reference means the two cannot disagree.
 */

interface ZodDef {
  type: string;
  innerType?: { def: ZodDef; description?: string };
  element?: { def: ZodDef };
  values?: unknown[];
  entries?: Record<string, unknown>;
  shape?: Record<string, { def: ZodDef; description?: string }>;
  options?: { def: ZodDef; description?: string }[];
}

type ZodInternal = { def: ZodDef; description?: string; shape?: Record<string, ZodInternal> };

function describeType(schema: ZodInternal): { text: string; optional: boolean } {
  const def = schema.def;

  switch (def.type) {
    case "optional":
    case "default":
    case "nullable": {
      const inner = describeType(def.innerType as unknown as ZodInternal);
      return {
        text: def.type === "nullable" ? `${inner.text}|null` : inner.text,
        optional: def.type !== "nullable" || inner.optional,
      };
    }
    case "literal":
      return { text: JSON.stringify(def.values?.[0]), optional: false };
    case "enum":
      return {
        text: Object.values(def.entries ?? {})
          .map((v) => JSON.stringify(v))
          .join("|"),
        optional: false,
      };
    case "array":
      return {
        text: `${describeType(def.element as unknown as ZodInternal).text}[]`,
        optional: false,
      };
    case "record":
      return { text: "object", optional: false };
    case "object": {
      const shape = (def.shape ?? {}) as Record<string, ZodInternal>;
      const keys = Object.keys(shape);
      if (keys.length === 0 || keys.length > 6) return { text: "object", optional: false };
      return {
        text: `{${keys.map((k) => `${k}: ${describeType(shape[k]).text}`).join(", ")}}`,
        optional: false,
      };
    }
    case "union":
      return { text: "value", optional: false };
    default:
      return { text: def.type, optional: false };
  }
}

/** One line per operation: `op "name" — description; args`. */
export function opReferenceFromSchema(schema: ZodType): string {
  const internal = schema as unknown as ZodInternal;
  const options = (internal.def.options ?? []) as unknown as ZodInternal[];

  return options
    .map((option) => {
      const shape = (option.def.shape ?? {}) as Record<string, ZodInternal>;
      const opName = shape.op?.def.values?.[0];
      const args = Object.entries(shape)
        .filter(([key]) => key !== "op")
        .map(([key, value]) => {
          const { text, optional } = describeType(value);
          return `${key}${optional ? "?" : ""}: ${text}`;
        });

      const description = option.description ? ` — ${option.description}` : "";
      return `- {"op": ${JSON.stringify(opName)}${args.length ? `, ${args.join(", ")}` : ""}}${description}`;
    })
    .join("\n");
}

export function opReference(kind: DocKind): string {
  return opReferenceFromSchema(getSurface(kind).opSchema);
}

export type { ZodInternal };
