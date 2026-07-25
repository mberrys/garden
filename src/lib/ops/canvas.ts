import { z } from "zod";
import {
  type CanvasBody,
  type CanvasNode,
  CanvasNodeSchema,
} from "@/lib/docs/schema";
import { makeCanvasNode } from "@/lib/docs/factories";
import { OpError } from "./errors";

const NodeKindSchema = z.enum([
  "rect",
  "ellipse",
  "diamond",
  "text",
  "frame",
  "line",
  "ink",
  "connector",
]);

/**
 * Canvas operations.
 *
 * Note what is *not* here: viewport changes. Panning is view state, not
 * document state — putting it on the undo stack would mean ctrl+Z scrolls the
 * canvas instead of undoing the user's last edit.
 */
export const CanvasOpSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("addNode"),
      node: z.object({ kind: NodeKindSchema }).catchall(z.unknown()),
      /** Insertion index in paint order; appends when omitted. */
      index: z.number().int().min(0).optional(),
    })
    .describe("Add a new shape, line, ink stroke or connector to the canvas"),
  z
    .object({
      op: z.literal("updateNode"),
      id: z.string(),
      patch: z.record(z.string(), z.unknown()),
    })
    .describe("Change properties of an existing node (position, size, style, text)"),
  z
    .object({ op: z.literal("deleteNode"), id: z.string() })
    .describe("Remove a node from the canvas"),
  z
    .object({ op: z.literal("reorderNode"), id: z.string(), toIndex: z.number().int().min(0) })
    .describe("Move a node in paint order; higher index draws on top"),
  z
    .object({ op: z.literal("setBackground"), background: z.enum(["grid", "dots", "plain"]) })
    .describe("Change the canvas background style"),
]);

export type CanvasOp = z.infer<typeof CanvasOpSchema>;

export function applyCanvasOps(
  body: CanvasBody,
  ops: CanvasOp[],
): { body: CanvasBody; inverse: CanvasOp[] } {
  let nodes = body.nodes.slice();
  let background = body.background;
  const inverse: CanvasOp[] = [];

  for (const op of ops) {
    switch (op.op) {
      case "addNode": {
        let node: CanvasNode;
        try {
          node = makeCanvasNode(op.node as { kind: CanvasNode["kind"] });
        } catch (err) {
          throw new OpError(`addNode: ${describeZod(err)}`);
        }
        const at = op.index === undefined ? nodes.length : Math.min(op.index, nodes.length);
        nodes.splice(at, 0, node);
        inverse.push({ op: "deleteNode", id: node.id });
        break;
      }

      case "updateNode": {
        const index = nodes.findIndex((n) => n.id === op.id);
        if (index === -1) throw new OpError(`updateNode: no node with id "${op.id}"`);
        const before = nodes[index];

        // The patch may not change a node's kind — that would silently swap one
        // shape for another and make the inverse unrepresentable.
        if ("kind" in op.patch && op.patch.kind !== before.kind) {
          throw new OpError(`updateNode: cannot change kind of "${op.id}"`);
        }

        const merged = { ...before, ...op.patch, kind: before.kind, id: before.id };
        const parsed = CanvasNodeSchema.safeParse(merged);
        if (!parsed.success) {
          throw new OpError(`updateNode "${op.id}": ${formatIssues(parsed.error)}`);
        }

        const priorValues: Record<string, unknown> = {};
        for (const key of Object.keys(op.patch)) {
          priorValues[key] = (before as unknown as Record<string, unknown>)[key];
        }
        inverse.push({ op: "updateNode", id: op.id, patch: priorValues });

        nodes = nodes.slice();
        nodes[index] = parsed.data;
        break;
      }

      case "deleteNode": {
        const index = nodes.findIndex((n) => n.id === op.id);
        if (index === -1) throw new OpError(`deleteNode: no node with id "${op.id}"`);
        const [removed] = nodes.splice(index, 1);
        inverse.push({
          op: "addNode",
          node: removed as unknown as { kind: CanvasNode["kind"] } & Record<string, unknown>,
          index,
        });

        // Connectors bound to a deleted node would dangle; detach them so the
        // scene stays valid, and record the detach so undo restores the binding.
        nodes = nodes.map((n) => {
          if (n.kind !== "connector") return n;
          const fromHit = n.from.nodeId === op.id;
          const toHit = n.to.nodeId === op.id;
          if (!fromHit && !toHit) return n;
          inverse.push({
            op: "updateNode",
            id: n.id,
            patch: { ...(fromHit ? { from: n.from } : {}), ...(toHit ? { to: n.to } : {}) },
          });
          return {
            ...n,
            from: fromHit ? { ...n.from, nodeId: null } : n.from,
            to: toHit ? { ...n.to, nodeId: null } : n.to,
          };
        });
        break;
      }

      case "reorderNode": {
        const from = nodes.findIndex((n) => n.id === op.id);
        if (from === -1) throw new OpError(`reorderNode: no node with id "${op.id}"`);
        const to = Math.max(0, Math.min(op.toIndex, nodes.length - 1));
        if (from === to) break;
        const [moved] = nodes.splice(from, 1);
        nodes.splice(to, 0, moved);
        inverse.push({ op: "reorderNode", id: op.id, toIndex: from });
        break;
      }

      case "setBackground": {
        inverse.push({ op: "setBackground", background });
        background = op.background;
        break;
      }
    }
  }

  return { body: { ...body, nodes, background }, inverse: inverse.reverse() };
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ");
}

function describeZod(err: unknown): string {
  if (err instanceof z.ZodError) return formatIssues(err);
  return err instanceof Error ? err.message : String(err);
}
