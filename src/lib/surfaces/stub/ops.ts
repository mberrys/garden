import { OpError } from "@/lib/ops/errors";
import type { StubBody, StubItem, StubOp } from "./schema";

export function applyStubOps(body: StubBody, ops: StubOp[]): { body: StubBody; inverse: StubOp[] } {
  let items = body.items.slice();
  const inverse: StubOp[] = [];

  for (const op of ops) {
    switch (op.op) {
      case "addItem": {
        if (items.some((item) => item.id === op.id)) {
          throw new OpError(`addItem: duplicate id ${op.id}`);
        }
        const item: StubItem = { id: op.id, text: op.text, done: op.done ?? false };
        const at = op.index === undefined ? items.length : Math.min(op.index, items.length);
        items.splice(at, 0, item);
        inverse.push({ op: "removeItem", id: op.id });
        break;
      }

      case "setItem": {
        const index = items.findIndex((item) => item.id === op.id);
        if (index === -1) throw new OpError(`setItem: unknown id ${op.id}`);
        const prev = items[index];
        const next: StubItem = {
          id: prev.id,
          text: op.patch.text ?? prev.text,
          done: op.patch.done ?? prev.done,
        };
        items[index] = next;
        const patch: { text?: string; done?: boolean } = {};
        if (op.patch.text !== undefined && op.patch.text !== prev.text) patch.text = prev.text;
        if (op.patch.done !== undefined && op.patch.done !== prev.done) patch.done = prev.done;
        if (Object.keys(patch).length > 0) {
          inverse.push({ op: "setItem", id: op.id, patch });
        }
        break;
      }

      case "removeItem": {
        const index = items.findIndex((item) => item.id === op.id);
        if (index === -1) throw new OpError(`removeItem: unknown id ${op.id}`);
        const [removed] = items.splice(index, 1);
        inverse.push({
          op: "addItem",
          id: removed.id,
          text: removed.text,
          done: removed.done,
          index,
        });
        break;
      }

      default: {
        const never: never = op;
        throw new OpError(`unknown stub op: ${JSON.stringify(never)}`);
      }
    }
  }

  return { body: { items }, inverse: inverse.reverse() };
}
