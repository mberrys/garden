import type { Anchor, CanvasNode, ConnectorNode, Rect } from "@/lib/docs/schema";
import { isBoxNode } from "@/lib/docs/schema";

/**
 * Scene geometry: bounds, hit testing, anchors and connector routing.
 *
 * Everything here is pure and works in scene coordinates. The renderer and the
 * pointer handlers both use it, so what you see highlighted is exactly what you
 * will hit.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 6;

/* ------------------------------------------------------------------ *
 * Coordinate transforms
 * ------------------------------------------------------------------ */

export function screenToScene(viewport: Viewport, x: number, y: number): Point {
  return { x: (x - viewport.x) / viewport.zoom, y: (y - viewport.y) / viewport.zoom };
}

export function sceneToScreen(viewport: Viewport, x: number, y: number): Point {
  return { x: x * viewport.zoom + viewport.x, y: y * viewport.zoom + viewport.y };
}

/** Zooms about a fixed screen point, so the content under the cursor stays put. */
export function zoomAt(viewport: Viewport, screen: Point, nextZoom: number): Viewport {
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const scene = screenToScene(viewport, screen.x, screen.y);
  return { zoom, x: screen.x - scene.x * zoom, y: screen.y - scene.y * zoom };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/* ------------------------------------------------------------------ *
 * Bounds
 * ------------------------------------------------------------------ */

export function nodeBounds(node: CanvasNode, byId?: Map<string, CanvasNode>): Rect {
  if (isBoxNode(node)) {
    return normalizeRect({ x: node.x, y: node.y, w: node.w, h: node.h });
  }

  if (node.kind === "line") {
    return boundsOfPoints(node.points, 2);
  }

  if (node.kind === "ink") {
    const padding = node.size;
    const box = boundsOfPoints(node.points, 3);
    return { x: box.x - padding, y: box.y - padding, w: box.w + padding * 2, h: box.h + padding * 2 };
  }

  const points = connectorPoints(node, byId ?? new Map());
  return boundsOfPoints(points, 2);
}

function boundsOfPoints(points: number[], stride: number): Rect {
  if (points.length < 2) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += stride) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Rewrites a rect with negative width/height into an equivalent positive one. */
export function normalizeRect(rect: Rect): Rect {
  return {
    x: rect.w < 0 ? rect.x + rect.w : rect.x,
    y: rect.h < 0 ? rect.y + rect.h : rect.y,
    w: Math.abs(rect.w),
    h: Math.abs(rect.h),
  };
}

export function unionBounds(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

export function pointInRect(point: Point, rect: Rect, tolerance = 0): boolean {
  return (
    point.x >= rect.x - tolerance &&
    point.x <= rect.x + rect.w + tolerance &&
    point.y >= rect.y - tolerance &&
    point.y <= rect.y + rect.h + tolerance
  );
}

/* ------------------------------------------------------------------ *
 * Hit testing
 * ------------------------------------------------------------------ */

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function nearPolyline(point: Point, points: number[], stride: number, tolerance: number): boolean {
  for (let i = 0; i + stride + 1 < points.length; i += stride) {
    const a = { x: points[i], y: points[i + 1] };
    const b = { x: points[i + stride], y: points[i + stride + 1] };
    if (distanceToSegment(point, a, b) <= tolerance) return true;
  }
  return false;
}

/**
 * Topmost node under a point.
 *
 * Frames only respond on their edge and title bar: a frame is a container, and
 * clicking inside one should select what is in it, not drag the frame.
 */
export function hitTest(
  nodes: CanvasNode[],
  point: Point,
  tolerance: number,
  byId?: Map<string, CanvasNode>,
): CanvasNode | null {
  const index = byId ?? new Map(nodes.map((n) => [n.id, n]));

  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node.locked) continue;

    switch (node.kind) {
      case "rect":
      case "diamond":
      case "text": {
        if (pointInRect(point, nodeBounds(node), tolerance)) return node;
        break;
      }
      case "ellipse": {
        const rx = node.w / 2;
        const ry = node.h / 2;
        if (rx <= 0 || ry <= 0) break;
        const nx = (point.x - (node.x + rx)) / (rx + tolerance);
        const ny = (point.y - (node.y + ry)) / (ry + tolerance);
        if (nx * nx + ny * ny <= 1) return node;
        break;
      }
      case "frame": {
        const bounds = nodeBounds(node);
        const onTitle = point.y >= bounds.y - 22 && point.y <= bounds.y && pointInRect({ ...point, y: bounds.y }, bounds, tolerance);
        const inside = pointInRect(point, bounds, tolerance);
        const inInterior = pointInRect(point, {
          x: bounds.x + tolerance * 2,
          y: bounds.y + tolerance * 2,
          w: bounds.w - tolerance * 4,
          h: bounds.h - tolerance * 4,
        });
        if (onTitle || (inside && !inInterior)) return node;
        break;
      }
      case "line":
        if (nearPolyline(point, node.points, 2, tolerance + node.strokeWidth / 2)) return node;
        break;
      case "ink":
        if (nearPolyline(point, node.points, 3, tolerance + node.size / 2)) return node;
        break;
      case "connector": {
        const points = connectorPoints(node, index);
        if (nearPolyline(point, points, 2, tolerance + node.strokeWidth / 2)) return node;
        break;
      }
    }
  }

  return null;
}

export function nodesInRect(nodes: CanvasNode[], rect: Rect, byId?: Map<string, CanvasNode>): CanvasNode[] {
  const index = byId ?? new Map(nodes.map((n) => [n.id, n]));
  const normalized = normalizeRect(rect);
  return nodes.filter((node) => !node.locked && rectsOverlap(nodeBounds(node, index), normalized));
}

/* ------------------------------------------------------------------ *
 * Connectors
 * ------------------------------------------------------------------ */

export function anchorPoint(bounds: Rect, anchor: Anchor, toward?: Point): Point {
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;

  const resolved: Exclude<Anchor, "auto"> =
    anchor === "auto" ? autoAnchor(bounds, toward ?? { x: cx, y: cy }) : anchor;

  switch (resolved) {
    case "top":
      return { x: cx, y: bounds.y };
    case "bottom":
      return { x: cx, y: bounds.y + bounds.h };
    case "left":
      return { x: bounds.x, y: cy };
    case "right":
      return { x: bounds.x + bounds.w, y: cy };
  }
}

/** Picks the side facing the other end of the connector. */
function autoAnchor(bounds: Rect, toward: Point): Exclude<Anchor, "auto"> {
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (Math.abs(dx) * bounds.h > Math.abs(dy) * bounds.w) {
    return dx > 0 ? "right" : "left";
  }
  return dy > 0 ? "bottom" : "top";
}

/** Resolves a connector into a flat polyline in scene coordinates. */
export function connectorPoints(
  connector: ConnectorNode,
  byId: Map<string, CanvasNode>,
): number[] {
  const fromNode = connector.from.nodeId ? byId.get(connector.from.nodeId) : undefined;
  const toNode = connector.to.nodeId ? byId.get(connector.to.nodeId) : undefined;

  const fromBounds = fromNode ? nodeBounds(fromNode, byId) : null;
  const toBounds = toNode ? nodeBounds(toNode, byId) : null;

  const fallbackFrom = { x: connector.from.x, y: connector.from.y };
  const fallbackTo = { x: connector.to.x, y: connector.to.y };

  const toCentre = toBounds
    ? { x: toBounds.x + toBounds.w / 2, y: toBounds.y + toBounds.h / 2 }
    : fallbackTo;
  const fromCentre = fromBounds
    ? { x: fromBounds.x + fromBounds.w / 2, y: fromBounds.y + fromBounds.h / 2 }
    : fallbackFrom;

  const start = fromBounds ? anchorPoint(fromBounds, connector.from.anchor, toCentre) : fallbackFrom;
  const end = toBounds ? anchorPoint(toBounds, connector.to.anchor, fromCentre) : fallbackTo;

  if (connector.routing === "straight") {
    return [start.x, start.y, end.x, end.y];
  }

  // Elbow: leave and enter along the dominant axis so the line meets shapes
  // square-on rather than clipping their corners.
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  if (horizontal) {
    const midX = (start.x + end.x) / 2;
    return [start.x, start.y, midX, start.y, midX, end.y, end.x, end.y];
  }
  const midY = (start.y + end.y) / 2;
  return [start.x, start.y, start.x, midY, end.x, midY, end.x, end.y];
}

/* ------------------------------------------------------------------ *
 * Resize handles
 * ------------------------------------------------------------------ */

export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export type HandleId = (typeof HANDLES)[number];

export function handlePosition(bounds: Rect, handle: HandleId): Point {
  const { x, y, w, h } = bounds;
  switch (handle) {
    case "nw":
      return { x, y };
    case "n":
      return { x: x + w / 2, y };
    case "ne":
      return { x: x + w, y };
    case "e":
      return { x: x + w, y: y + h / 2 };
    case "se":
      return { x: x + w, y: y + h };
    case "s":
      return { x: x + w / 2, y: y + h };
    case "sw":
      return { x, y: y + h };
    case "w":
      return { x, y: y + h / 2 };
  }
}

export const HANDLE_CURSORS: Record<HandleId, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

/** Applies a resize drag to a rect, keeping the opposite edge pinned. */
export function resizeRect(bounds: Rect, handle: HandleId, point: Point, minSize = 8): Rect {
  let { x, y, w, h } = bounds;
  const right = x + w;
  const bottom = y + h;

  if (handle.includes("w")) {
    x = Math.min(point.x, right - minSize);
    w = right - x;
  }
  if (handle.includes("e")) {
    w = Math.max(minSize, point.x - x);
  }
  if (handle.includes("n")) {
    y = Math.min(point.y, bottom - minSize);
    h = bottom - y;
  }
  if (handle.includes("s")) {
    h = Math.max(minSize, point.y - y);
  }

  return { x, y, w, h };
}

export function snap(value: number, grid: number): number {
  return grid > 0 ? Math.round(value / grid) * grid : value;
}

/* ------------------------------------------------------------------ *
 * Rounded paths
 * ------------------------------------------------------------------ */

export interface PathPoint {
  x: number;
  y: number;
}

function filletCorner(
  ctx: CanvasRenderingContext2D,
  prev: PathPoint,
  curr: PathPoint,
  next: PathPoint,
  radius: number,
  moveTo: boolean,
): void {
  const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
  const v2 = { x: next.x - curr.x, y: next.y - curr.y };
  const len1 = Math.hypot(v1.x, v1.y);
  const len2 = Math.hypot(v2.x, v2.y);
  if (len1 === 0 || len2 === 0) return;

  const u1 = { x: v1.x / len1, y: v1.y / len1 };
  const u2 = { x: v2.x / len2, y: v2.y / len2 };
  const r = Math.min(radius, len1 / 2, len2 / 2);
  const p1 = { x: curr.x + u1.x * r, y: curr.y + u1.y * r };
  const p2 = { x: curr.x + u2.x * r, y: curr.y + u2.y * r };

  if (moveTo) ctx.moveTo(p1.x, p1.y);
  else ctx.lineTo(p1.x, p1.y);
  ctx.quadraticCurveTo(curr.x, curr.y, p2.x, p2.y);
}

/** Closed polygon with rounded corners (quadratic fillets). */
export function roundedPolygonPath(
  ctx: CanvasRenderingContext2D,
  vertices: PathPoint[],
  radius: number,
): void {
  const n = vertices.length;
  if (n < 3) return;

  if (radius <= 0) {
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
    ctx.closePath();
    return;
  }

  for (let i = 0; i < n; i++) {
    filletCorner(
      ctx,
      vertices[(i - 1 + n) % n],
      vertices[i],
      vertices[(i + 1) % n],
      radius,
      i === 0,
    );
  }
  ctx.closePath();
}

/** Open polyline with rounded interior corners. */
export function roundedPolylinePath(
  ctx: CanvasRenderingContext2D,
  points: PathPoint[],
  radius: number,
): void {
  if (points.length < 2) return;

  if (radius <= 0 || points.length === 2) {
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    return;
  }

  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    filletCorner(ctx, points[i - 1], points[i], points[i + 1], radius, false);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
}

export function pointsFromFlat(flat: number[], stride: number): PathPoint[] {
  const points: PathPoint[] = [];
  for (let i = 0; i + 1 < flat.length; i += stride) {
    points.push({ x: flat[i], y: flat[i + 1] });
  }
  return points;
}
