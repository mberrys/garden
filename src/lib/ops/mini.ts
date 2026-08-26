import { z } from "zod";
import {
  type MiniBody,
  type MiniRecord,
  MiniDescriptorSchema,
  MiniRecordSchema,
} from "@/lib/docs/schema";
import { newRecordId } from "@/lib/docs/ids";
import { OpError } from "./errors";

export const MiniOpSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("setDescriptor"),
      descriptor: MiniDescriptorSchema,
    })
    .describe("Replace the mini-tool descriptor (template + fields)"),
  z
    .object({
      op: z.literal("addRecord"),
      record: z
        .object({
          id: z.string().optional(),
          values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
        })
        .optional(),
      index: z.number().int().min(0).optional(),
    })
    .describe("Add a record to the mini-tool"),
  z
    .object({
      op: z.literal("updateRecord"),
      id: z.string(),
      values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    })
    .describe("Patch record values"),
  z
    .object({ op: z.literal("deleteRecord"), id: z.string() })
    .describe("Delete a record"),
  z
    .object({
      op: z.literal("setField"),
      recordId: z.string(),
      fieldId: z.string(),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    })
    .describe("Set one field on a record"),
]);

export type MiniOp = z.infer<typeof MiniOpSchema>;

export function applyMiniOps(
  body: MiniBody,
  ops: MiniOp[],
): { body: MiniBody; inverse: MiniOp[] } {
  let descriptor = body.descriptor;
  let records = body.records.map((record) => ({ ...record, values: { ...record.values } }));
  const inverse: MiniOp[] = [];

  for (const op of ops) {
    switch (op.op) {
      case "setDescriptor": {
        const parsed = MiniDescriptorSchema.safeParse(op.descriptor);
        if (!parsed.success) throw new OpError(`setDescriptor: ${parsed.error.message}`);
        inverse.push({ op: "setDescriptor", descriptor });
        descriptor = parsed.data;
        break;
      }
      case "addRecord": {
        const record: MiniRecord = {
          id: op.record?.id ?? newRecordId(),
          values: op.record?.values ?? {},
        };
        const parsed = MiniRecordSchema.safeParse(record);
        if (!parsed.success) throw new OpError(`addRecord: ${parsed.error.message}`);
        if (records.some((r) => r.id === parsed.data.id)) {
          throw new OpError(`addRecord: record "${parsed.data.id}" already exists`);
        }
        const at = op.index === undefined ? records.length : Math.min(op.index, records.length);
        records.splice(at, 0, parsed.data);
        inverse.push({ op: "deleteRecord", id: parsed.data.id });
        break;
      }
      case "updateRecord": {
        const index = records.findIndex((r) => r.id === op.id);
        if (index === -1) throw new OpError(`updateRecord: no record "${op.id}"`);
        const before = records[index];
        inverse.push({ op: "updateRecord", id: op.id, values: { ...before.values } });
        records = records.slice();
        records[index] = { ...before, values: { ...before.values, ...op.values } };
        break;
      }
      case "deleteRecord": {
        const index = records.findIndex((r) => r.id === op.id);
        if (index === -1) throw new OpError(`deleteRecord: no record "${op.id}"`);
        const [removed] = records.splice(index, 1);
        inverse.push({
          op: "addRecord",
          record: { id: removed.id, values: removed.values },
          index,
        });
        break;
      }
      case "setField": {
        const record = records.find((r) => r.id === op.recordId);
        if (!record) throw new OpError(`setField: no record "${op.recordId}"`);
        const prior = record.values[op.fieldId];
        inverse.push({
          op: "setField",
          recordId: op.recordId,
          fieldId: op.fieldId,
          value: prior === undefined ? null : prior,
        });
        if (op.value === null) delete record.values[op.fieldId];
        else record.values[op.fieldId] = op.value;
        break;
      }
      default: {
        const _exhaustive: never = op;
        throw new OpError(`unknown mini op: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  return {
    body: { descriptor, records },
    inverse: inverse.reverse(),
  };
}
