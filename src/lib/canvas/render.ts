import getStroke from "perfect-freehand";
import type { CanvasBody, CanvasNode, Rect } from "@/lib/docs/schema";
import { connectorPoints, nodeBounds, pointsFromFlat, roundedPolygonPath, roundedPolylinePath, type Viewport } from "./geometry";

/**
 * Immediate-mode renderer for the canvas scene.
 *
 * One `<canvas>` element draws everything; React only handles chrome (selection
 * handles, inline text editing). At a few thousand nodes this stays smooth,
 * which a DOM-node-per-shape approach would not.
 */

export interface RenderTheme {
  background: string;
  grid: string;
  gridStrong: string;
  accent: string;
  text: string;
  muted: string;
  selection: string;
}

export interface RenderOptions {
  ctx: CanvasRenderingContext2D;
  body: CanvasBody;
  viewport: Viewport;
  width: number;
  height: number;
  dpr: number;
  theme: RenderTheme;
  selectedIds: Set<string>;
  /** Node currently under the cursor, highlighted subtly. */
  hoverId?: string | null;
  /** In-progress marquee, in scene coordinates. */
  marquee?: Rect | null;
  /** In-progress shape or stroke not yet committed to the document. */
  draft?: CanvasNode | null;
}

const GRID_SIZE = 20;
const FONT_STACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function renderScene(options: RenderOptions): void {
  const { ctx, body, viewport, width, height, dpr, theme } = options;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  drawBackground(ctx, viewport, width, height, body.background, theme);

  ctx.translate(viewport.x, viewport.y);
  ctx.scale(viewport.zoom, viewport.zoom);

  const byId = new Map(body.nodes.map((node) => [node.id, node]));

  // Highlighter ink renders beneath everything so it reads as marker on paper
  // rather than paint over the diagram.
  const highlighters = body.nodes.filter((n) => n.kind === "ink" && n.highlighter);
  const rest = body.nodes.filter((n) => !(n.kind === "ink" && n.highlighter));

  for (const node of highlighters) drawNode(ctx, node, byId, theme);
  for (const node of rest) drawNode(ctx, node, byId, theme);
  if (options.draft) drawNode(ctx, options.draft, byId, theme);

  drawSelection(ctx, options, byId);
  if (options.marquee) drawMarquee(ctx, options.marquee, viewport, theme);

  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * Background
 * ------------------------------------------------------------------ */

function drawBackground(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  width: number,
  height: number,
  style: CanvasBody["background"],
  theme: RenderTheme,
): void {
  if (style === "plain") return;

  const step = GRID_SIZE * viewport.zoom;
  // Below ~8px the grid becomes visual noise; drop to the coarse grid instead.
  const spacing = step < 8 ? step * 5 : step;
  if (spacing < 4) return;

  const offsetX = viewport.x % spacing;
  const offsetY = viewport.y % spacing;

  if (style === "dots") {
    ctx.fillStyle = theme.grid;
    const radius = Math.min(1.4, Math.max(0.6, viewport.zoom));
    for (let x = offsetX; x < width; x += spacing) {
      for (let y = offsetY; y < height; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.grid;
  ctx.beginPath();
  for (let x = offsetX; x < width; x += spacing) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
  }
  for (let y = offsetY; y < height; y += spacing) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
  }
  ctx.stroke();

  // Every fifth line is emphasised so distances stay readable when zoomed out.
  const major = spacing * 5;
  if (major < 40) return;
  const majorX = viewport.x % major;
  const majorY = viewport.y % major;
  ctx.strokeStyle = theme.gridStrong;
  ctx.beginPath();
  for (let x = majorX; x < width; x += major) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
  }
  for (let y = majorY; y < height; y += major) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
  }
  ctx.stroke();
}

/* ------------------------------------------------------------------ *
 * Nodes
 * ------------------------------------------------------------------ */

function applyStrokeStyle(ctx: CanvasRenderingContext2D, style: string, width: number): void {
  if (style === "dashed") ctx.setLineDash([width * 3, width * 2.5]);
  else if (style === "dotted") ctx.setLineDash([0.1, width * 2.2]);
  else ctx.setLineDash([]);
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: CanvasNode,
  byId: Map<string, CanvasNode>,
  theme: RenderTheme,
): void {
  ctx.save();
  ctx.globalAlpha = node.opacity;
  ctx.lineCap = "round";

  switch (node.kind) {
    case "rect":
    case "ellipse":
    case "diamond": {
      withRotation(ctx, node.x, node.y, node.w, node.h, node.rotation, () => {
        ctx.beginPath();
        if (node.kind === "rect") {
          roundedRect(ctx, node.x, node.y, node.w, node.h, node.radius);
        } else if (node.kind === "ellipse") {
          ctx.ellipse(
            node.x + node.w / 2,
            node.y + node.h / 2,
            Math.abs(node.w / 2),
            Math.abs(node.h / 2),
            0,
            0,
            Math.PI * 2,
          );
        } else {
          const cx = node.x + node.w / 2;
          const cy = node.y + node.h / 2;
          if (node.kind === "diamond" && node.radius > 0) {
            roundedPolygonPath(
              ctx,
              [
                { x: cx, y: node.y },
                { x: node.x + node.w, y: cy },
                { x: cx, y: node.y + node.h },
                { x: node.x, y: cy },
              ],
              node.radius,
            );
          } else {
            ctx.moveTo(cx, node.y);
            ctx.lineTo(node.x + node.w, cy);
            ctx.lineTo(cx, node.y + node.h);
            ctx.lineTo(node.x, cy);
            ctx.closePath();
          }
        }

        if (node.fill) {
          ctx.fillStyle = node.fill;
          ctx.fill();
        }
        if (node.strokeWidth > 0) {
          applyStrokeStyle(ctx, node.strokeStyle, node.strokeWidth);
          ctx.lineWidth = node.strokeWidth;
          ctx.strokeStyle = node.stroke;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (node.text) {
          drawWrappedText(ctx, node.text, node, node.fontSize, node.textColor, "center", "middle");
        }
      });
      break;
    }

    case "text": {
      withRotation(ctx, node.x, node.y, node.w, node.h, node.rotation, () => {
        drawWrappedText(
          ctx,
          node.text,
          node,
          node.fontSize,
          node.textColor,
          node.align,
          "top",
          node.weight === "bold" ? 700 : 400,
        );
      });
      break;
    }

    case "frame": {
      ctx.beginPath();
      roundedRect(ctx, node.x, node.y, node.w, node.h, 4);
      if (node.fill) {
        ctx.fillStyle = node.fill;
        ctx.fill();
      }
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = node.stroke;
      ctx.stroke();

      ctx.font = `500 12px ${FONT_STACK}`;
      ctx.fillStyle = theme.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(node.name, node.x, node.y - 6);
      break;
    }

    case "line": {
      applyStrokeStyle(ctx, node.strokeStyle, node.strokeWidth);
      ctx.lineWidth = node.strokeWidth;
      ctx.strokeStyle = node.stroke;
      strokePolyline(ctx, node.points, 2, node.cornerRadius);
      ctx.setLineDash([]);
      drawArrows(ctx, node.points, 2, node.arrowStart, node.arrowEnd, node.stroke, node.strokeWidth);
      break;
    }

    case "ink": {
      drawInk(ctx, node);
      break;
    }

    case "connector": {
      const points = connectorPoints(node, byId);
      applyStrokeStyle(ctx, node.strokeStyle, node.strokeWidth);
      ctx.lineWidth = node.strokeWidth;
      ctx.strokeStyle = node.stroke;
      strokePolyline(ctx, points, 2, node.cornerRadius);
      ctx.setLineDash([]);
      drawArrows(ctx, points, 2, node.arrowStart, node.arrowEnd, node.stroke, node.strokeWidth);

      if (node.label) {
        const mid = midpointOf(points);
        ctx.font = `12px ${FONT_STACK}`;
        const width = ctx.measureText(node.label).width;
        // Knock a hole in the line so the label stays legible over it.
        ctx.fillStyle = theme.background;
        ctx.fillRect(mid.x - width / 2 - 4, mid.y - 9, width + 8, 18);
        ctx.fillStyle = theme.muted;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(node.label, mid.x, mid.y);
      }
      break;
    }
  }

  ctx.restore();
}

function withRotation(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
  draw: () => void,
): void {
  if (!rotation) {
    draw();
    return;
  }
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  draw();
  ctx.restore();
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.roundRect(x, y, w, h, r);
}

function strokePolyline(
  ctx: CanvasRenderingContext2D,
  points: number[],
  stride: number,
  cornerRadius = 0,
): void {
  if (points.length < 4) return;
  ctx.beginPath();
  ctx.lineJoin = cornerRadius > 0 ? "round" : "miter";
  roundedPolylinePath(ctx, pointsFromFlat(points, stride), cornerRadius);
  ctx.stroke();
}

function drawArrows(
  ctx: CanvasRenderingContext2D,
  points: number[],
  stride: number,
  atStart: boolean,
  atEnd: boolean,
  color: string,
  width: number,
): void {
  if (points.length < 4) return;
  const size = Math.max(8, width * 3.5);

  if (atEnd) {
    const tip = { x: points[points.length - stride], y: points[points.length - stride + 1] };
    const prev = { x: points[points.length - stride * 2], y: points[points.length - stride * 2 + 1] };
    arrowHead(ctx, prev, tip, size, color);
  }
  if (atStart) {
    const tip = { x: points[0], y: points[1] };
    const next = { x: points[stride], y: points[stride + 1] };
    arrowHead(ctx, next, tip, size, color);
  }
}

function arrowHead(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  tip: { x: number; y: number },
  size: number,
  color: string,
): void {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const spread = Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - size * Math.cos(angle - spread), tip.y - size * Math.sin(angle - spread));
  ctx.lineTo(tip.x - size * Math.cos(angle + spread), tip.y - size * Math.sin(angle + spread));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function midpointOf(points: number[]): { x: number; y: number } {
  const mid = Math.floor(points.length / 4) * 2;
  return { x: points[mid], y: points[mid + 1] };
}

function drawInk(ctx: CanvasRenderingContext2D, node: Extract<CanvasNode, { kind: "ink" }>): void {
  const input: [number, number, number][] = [];
  for (let i = 0; i + 2 < node.points.length; i += 3) {
    input.push([node.points[i], node.points[i + 1], node.points[i + 2]]);
  }
  if (input.length === 0) return;

  const outline = getStroke(input, {
    size: node.size,
    thinning: node.highlighter ? 0 : 0.55,
    smoothing: node.smoothing,
    streamline: 0.35 + node.smoothing * 0.45,
    simulatePressure: false,
    last: true,
  });
  if (outline.length < 3) return;

  ctx.save();
  if (node.highlighter) {
    ctx.globalAlpha = node.opacity * 0.38;
    ctx.globalCompositeOperation = "multiply";
  }
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i][0], outline[i][1]);
  ctx.closePath();
  ctx.fillStyle = node.stroke;
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !current) current = candidate;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: { x: number; y: number; w: number; h: number },
  fontSize: number,
  color: string,
  align: "left" | "center" | "right",
  valign: "top" | "middle",
  weight = 400,
): void {
  ctx.font = `${weight} ${fontSize}px ${FONT_STACK}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = align === "center" ? "center" : align === "right" ? "right" : "left";

  const padding = 8;
  const maxWidth = Math.max(8, box.w - padding * 2);
  const lines = wrapText(ctx, text, maxWidth);
  const lineHeight = fontSize * 1.35;
  const totalHeight = lines.length * lineHeight;

  const x =
    align === "center" ? box.x + box.w / 2 : align === "right" ? box.x + box.w - padding : box.x + padding;
  const startY =
    valign === "middle"
      ? box.y + box.h / 2 - totalHeight / 2 + lineHeight / 2
      : box.y + padding + lineHeight / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineHeight));
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * Selection chrome
 * ------------------------------------------------------------------ */

function drawSelection(
  ctx: CanvasRenderingContext2D,
  options: RenderOptions,
  byId: Map<string, CanvasNode>,
): void {
  const { body, selectedIds, hoverId, viewport, theme } = options;
  const lineWidth = 1.5 / viewport.zoom;

  if (hoverId && !selectedIds.has(hoverId)) {
    const node = byId.get(hoverId);
    if (node) {
      const bounds = nodeBounds(node, byId);
      ctx.strokeStyle = theme.selection;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([]);
      ctx.strokeRect(bounds.x - 2, bounds.y - 2, bounds.w + 4, bounds.h + 4);
      ctx.globalAlpha = 1;
    }
  }

  for (const node of body.nodes) {
    if (!selectedIds.has(node.id)) continue;
    const bounds = nodeBounds(node, byId);
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([]);
    ctx.strokeRect(bounds.x - 2, bounds.y - 2, bounds.w + 4, bounds.h + 4);
  }
}

function drawMarquee(
  ctx: CanvasRenderingContext2D,
  marquee: Rect,
  viewport: Viewport,
  theme: RenderTheme,
): void {
  ctx.save();
  ctx.fillStyle = theme.selection;
  ctx.globalAlpha = 0.1;
  ctx.fillRect(marquee.x, marquee.y, marquee.w, marquee.h);
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = theme.selection;
  ctx.lineWidth = 1 / viewport.zoom;
  ctx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h);
  ctx.restore();
}
