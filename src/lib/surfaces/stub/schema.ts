import { z } from "zod";
import { SCHEMA_VERSION } from "@/lib/docs/schema";

export const STUB_KIND = "stub" as const;

export const StubItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean(),
});
export type StubItem = z.infer<typeof StubItemSchema>;

export const StubBodySchema = z.object({
  items: z.array(StubItemSchema),
});
export type StubBody = z.infer<typeof StubBodySchema>;

export const StubSelectionSchema = z.union([
  z.object({ index: z.number().int().min(0) }),
  z.null(),
]);
export type StubSelection = z.infer<typeof StubSelectionSchema>;

export const StubOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("addItem"),
    id: z.string(),
    text: z.string(),
    done: z.boolean().default(false),
    index: z.number().int().min(0).optional(),
  }),
  z.object({
    op: z.literal("setItem"),
    id: z.string(),
    patch: z.object({
      text: z.string().optional(),
      done: z.boolean().optional(),
    }),
  }),
  z.object({
    op: z.literal("removeItem"),
    id: z.string(),
  }),
]);
export type StubOp = z.infer<typeof StubOpSchema>;

export const StubDocSchema = z.object({
  id: z.string(),
  kind: z.literal(STUB_KIND),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  schemaVersion: z.number().int(),
  body: StubBodySchema,
});
export type StubDoc = z.infer<typeof StubDocSchema>;

export function createStubDoc(title = "Stub checklist", body: StubBody = { items: [] }): StubDoc {
  const now = Date.now();
  return {
    id: `doc_stub_${now}`,
    kind: STUB_KIND,
    title,
    createdAt: now,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION,
    body,
  };
}
