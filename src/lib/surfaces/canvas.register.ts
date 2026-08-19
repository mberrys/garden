import { Shapes } from "lucide-react";
import type { CanvasDoc } from "@/lib/docs/schema";
import { CanvasOpSchema, applyCanvasOps } from "@/lib/ops/canvas";
import { createCanvasDoc } from "@/lib/docs/factories";
import { OPS_FENCE } from "@/lib/ai/ops-block";
import type { SurfaceSelection } from "@/lib/store/workspace";
import type { MockRequest } from "@/lib/ai/mock";
import { registerSurface } from "./registry";

function serializeCanvas(doc: CanvasDoc): string {
  const nodes = doc.body.nodes;
  if (nodes.length === 0) return "(empty canvas)";

  const lines = nodes.map((node) => {
    const label = "text" in node && node.text ? ` "${node.text}"` : "";
    switch (node.kind) {
      case "rect":
      case "ellipse":
      case "diamond":
      case "text":
        return `${node.id} ${node.kind} at (${round(node.x)},${round(node.y)}) size ${round(node.w)}x${round(node.h)}${label}`;
      case "frame":
        return `${node.id} frame "${node.name}" at (${round(node.x)},${round(node.y)}) size ${round(node.w)}x${round(node.h)}`;
      case "line":
        return `${node.id} line ${pointsSummary(node.points, 2)}`;
      case "ink":
        return `${node.id} ink stroke (${Math.floor(node.points.length / 3)} points)`;
      case "connector":
        return `${node.id} connector ${node.from.nodeId ?? "(free)"} -> ${node.to.nodeId ?? "(free)"}${node.label ? ` labelled "${node.label}"` : ""}`;
    }
  });

  return `${nodes.length} node(s), paint order first to last:\n${lines.join("\n")}`;
}

function describeCanvasSelection(selection: SurfaceSelection): string | null {
  if (selection.kind !== "canvas") return null;
  return selection.nodeIds.length
    ? `The user has selected canvas node(s): ${selection.nodeIds.join(", ")}`
    : null;
}

function mockCanvas(request: MockRequest): string {
  const doc = request.doc as CanvasDoc;
  const ask = request.request.toLowerCase();
  const nodes = doc.body.nodes;
  const boxes = nodes.filter(
    (n) => n.kind === "rect" || n.kind === "ellipse" || n.kind === "diamond",
  );

  if (/align|tidy|clean ?up|arrange|distribute/.test(ask) && boxes.length >= 2) {
    const left = Math.min(...boxes.map((b) => ("x" in b ? b.x : 0)));
    return block(`Aligned ${boxes.length} shapes to x=${Math.round(left)}.`, [
      ...boxes.map((b) => ({ op: "updateNode", id: b.id, patch: { x: left } })),
    ]);
  }

  const source = request.companions?.[0]?.doc;
  const labels = source
    ? ["Context", "Method", "Findings", "Implications"]
    : /flow|process|pipeline|diagram|architecture/.test(ask)
      ? ["Input", "Process", "Output"]
      : ["Idea", "Detail"];

  const baseX = 120;
  const baseY = 140;
  const stepX = 260;
  const ids = labels.map((_, i) => `nd_mock${i}${Math.random().toString(36).slice(2, 5)}`);

  const ops: unknown[] = labels.map((label, i) => ({
    op: "addNode",
    node: {
      kind: i === 0 ? "rect" : i === labels.length - 1 ? "ellipse" : "rect",
      id: ids[i],
      x: baseX + i * stepX,
      y: baseY,
      w: 180,
      h: 96,
      text: label,
      fill: "#eceafe",
      stroke: "#4f46e5",
    },
  }));

  for (let i = 0; i < ids.length - 1; i++) {
    ops.push({
      op: "addNode",
      node: {
        kind: "connector",
        from: { nodeId: ids[i], anchor: "right" },
        to: { nodeId: ids[i + 1], anchor: "left" },
        arrowEnd: true,
      },
    });
  }

  return block(
    source
      ? `Sketched a ${labels.length}-step diagram from "${source.title}".`
      : `Sketched a ${labels.length}-step diagram.`,
    ops,
  );
}

function describeCanvasOp(op: Record<string, unknown>): string | undefined {
  switch (op.op) {
    case "addNode": {
      const node = op.node as Record<string, unknown>;
      return `Add ${node.kind}${nodeLabel(node)}`;
    }
    case "updateNode":
      return `Update ${op.id} (${Object.keys(op.patch as Record<string, unknown>).join(", ")})`;
    case "deleteNode":
      return `Delete ${op.id}`;
    case "reorderNode":
      return `Move ${op.id} to position ${op.toIndex}`;
    case "setBackground":
      return `Set canvas background to ${op.background}`;
    default:
      return undefined;
  }
}

registerSurface({
  kind: "canvas",
  label: "Canvas",
  icon: Shapes,
  iconColor: "#8b5cf6",
  opSchema: CanvasOpSchema,
  applyOps: applyCanvasOps,
  createDoc: createCanvasDoc,
  ownsHistory: false,
  contextBudget: 8_000,
  promptNotes:
    "The canvas is an infinite 2D plane; x grows right and y grows down. A comfortable " +
    "shape is about 160x96 with 60px of space between shapes. Lay diagrams out on a grid " +
    "and connect shapes with connectors referencing their node ids rather than drawing " +
    "lines between coordinates — connectors re-route themselves when shapes move.",
  serializeDoc: serializeCanvas,
  describeSelection: describeCanvasSelection,
  mockReply: mockCanvas,
  describeOp: describeCanvasOp,
  referencedBlobIds: () => new Set(),
  remapBlobIds: (doc) => doc,
  adapter: {
    engine: "garden",
    status: "not-required",
    userEdits: "gestures preview locally, then commit on release",
    gardenUpdates: "React host re-renders from CanvasDoc.body",
    selection: "node id list, pushed to the workspace store",
    notes: "Garden-owned scene graph. Optional Konva later (#41) must mount as an adapter, not as the document model.",
    relatedIssue: 41,
  },
  loadComponent: () => import("@/surfaces/canvas/canvas-surface"),
});

function block(prose: string, ops: unknown[]): string {
  if (ops.length === 0) return prose;
  return `${prose}\n\n\`\`\`${OPS_FENCE}\n${JSON.stringify(ops, null, 2)}\n\`\`\``;
}

function nodeLabel(node: Record<string, unknown>): string {
  const text = node.text ?? node.name ?? node.label;
  return typeof text === "string" && text.trim() ? ` "${truncate(text, 40)}"` : "";
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function round(n: number): number {
  return Math.round(n);
}

function pointsSummary(points: number[], stride: number): string {
  const pairs: string[] = [];
  for (let i = 0; i + 1 < points.length; i += stride) {
    pairs.push(`(${round(points[i])},${round(points[i + 1])})`);
  }
  return pairs.slice(0, 6).join(" -> ") + (pairs.length > 6 ? " -> …" : "");
}
