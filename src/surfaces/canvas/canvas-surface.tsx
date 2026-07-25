"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CanvasDoc, CanvasNode, Rect } from "@/lib/docs/schema";
import { PALETTE, isBoxNode } from "@/lib/docs/schema";
import { makeCanvasNode } from "@/lib/docs/factories";
import type { CanvasOp } from "@/lib/ops";
import { useWorkspace, type PaneIndex } from "@/lib/store/workspace";
import {
  HANDLES,
  HANDLE_CURSORS,
  clamp,
  handlePosition,
  hitTest,
  nodeBounds,
  nodesInRect,
  normalizeRect,
  resizeRect,
  sceneToScreen,
  screenToScene,
  snap,
  unionBounds,
  zoomAt,
  type HandleId,
  type Point,
  type Viewport,
} from "@/lib/canvas/geometry";
import { renderScene, type RenderTheme } from "@/lib/canvas/render";
import { CanvasToolbar, roundingForStyle } from "./toolbar";
import { CanvasInspector } from "./inspector";
import { BOX_TOOLS, INK_TOOLS, LINE_TOOLS, TOOL_BY_KEY, cursorFor, type Tool } from "./tools";

const GRID = 10;
const HIT_TOLERANCE = 6;
const HANDLE_SIZE = 8;

/**
 * In-flight pointer gesture.
 *
 * Replaced wholesale on each pointermove rather than mutated, so React sees a
 * new value and the canvas repaints. A mirror ref lets the handlers read the
 * current gesture without waiting for the re-render.
 */
type Gesture =
  | { type: "pan"; startScreen: Point; startViewport: Viewport }
  | {
      type: "move";
      startScene: Point;
      originals: CanvasNode[];
      moved: boolean;
      current?: Point;
      altKey?: boolean;
    }
  | { type: "resize"; handle: HandleId; startScene: Point; original: CanvasNode; current?: Point }
  | { type: "marquee"; startScene: Point; additive: boolean; current?: Rect | null }
  | { type: "create"; startScene: Point; draft: CanvasNode }
  | { type: "ink"; points: number[]; draft: CanvasNode }
  | { type: "connector"; fromNodeId: string; draft: CanvasNode };

export default function CanvasSurface({
  doc,
  paneIndex: _paneIndex,
}: {
  doc: CanvasDoc;
  paneIndex: PaneIndex;
}) {
  const commit = useWorkspace((s) => s.commit);
  const setCanvasViewport = useWorkspace((s) => s.setCanvasViewport);
  const setSelection = useWorkspace((s) => s.setSelection);
  const toast = useWorkspace((s) => s.toast);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spaceRef = useRef(false);

  const [viewport, setViewport] = useState<Viewport>(doc.body.viewport);
  const [tool, setTool] = useState<Tool>("select");
  const [rawSelectedIds, setSelectedIds] = useState<string[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  /**
   * The gesture lives in state (so render sees it) with a ref mirror (so
   * pointer handlers read the current value without waiting for a re-render).
   * Handlers write through `putGesture`, which keeps the two in step.
   */
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const putGesture = useCallback((next: Gesture | null) => {
    gestureRef.current = next;
    setGesture(next);
  }, []);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [style, setStyle] = useState({
    stroke: PALETTE[7] as string,
    fill: null as string | null,
    strokeWidth: 2,
    fontSize: 16,
    roundingEnabled: true,
    rounding: 12,
  });

  const nodes = doc.body.nodes;
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  /**
   * Derived rather than pruned in an effect: nodes vanish from under the
   * selection whenever an AI suggestion is undone, and filtering during render
   * means there is never a frame where the selection references a dead node.
   */
  const selectedIds = useMemo(
    () => rawSelectedIds.filter((id) => byId.has(id)),
    [rawSelectedIds, byId],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  /* ---------------- viewport persistence ---------------- */

  useEffect(() => {
    const timer = setTimeout(() => setCanvasViewport(doc.id, viewport), 400);
    return () => clearTimeout(timer);
  }, [viewport, doc.id, setCanvasViewport]);

  /* ---------------- selection publishing ---------------- */

  useEffect(() => {
    setSelection(doc.id, { kind: "canvas", nodeIds: selectedIds });
  }, [selectedIds, doc.id, setSelection]);

  useEffect(() => () => setSelection(doc.id, null), [doc.id, setSelection]);

  /* ---------------- sizing ---------------- */

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /* ---------------- preview body ---------------- */

  /**
   * Drags render from a locally-transformed copy and commit once on release.
   * Committing per pointermove would flood the undo stack and rewrite the
   * document on every animation frame.
   */
  const preview = useMemo(() => {
    if (!gesture) return { nodes, draft: null as CanvasNode | null, marquee: null as Rect | null };

    switch (gesture.type) {
      case "move": {
        const patches = movePatches(gesture);
        if (!patches) break;
        return { nodes: applyPatches(nodes, patches), draft: null, marquee: null };
      }
      case "resize": {
        const patch = resizePatch(gesture);
        if (!patch) break;
        return { nodes: applyPatches(nodes, patch), draft: null, marquee: null };
      }
      case "create":
      case "ink":
      case "connector":
        return { nodes, draft: gesture.draft, marquee: null };
      case "marquee":
        return { nodes, draft: null, marquee: gesture.current ?? null };
    }
    return { nodes, draft: null, marquee: null };
  }, [nodes, gesture]);

  /* ---------------- rendering ---------------- */

  const theme = useCanvasTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    renderScene({
      ctx,
      body: { ...doc.body, nodes: preview.nodes },
      viewport,
      width: size.width,
      height: size.height,
      dpr,
      theme,
      selectedIds: selectedSet,
      hoverId,
      marquee: preview.marquee,
      draft: preview.draft,
    });
  }, [doc.body, preview, viewport, size, theme, selectedSet, hoverId]);

  /* ---------------- helpers ---------------- */

  const toScene = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return screenToScene(viewport, event.clientX - rect.left, event.clientY - rect.top);
    },
    [viewport],
  );

  const maybeSnap = useCallback(
    (value: number, event: { altKey: boolean }) => (event.altKey ? value : snap(value, GRID)),
    [],
  );

  const apply = useCallback(
    (ops: CanvasOp[], label?: string) => {
      if (ops.length === 0) return;
      const result = commit<"canvas">(doc.id, ops, { label });
      if (!result.ok) toast("error", result.error ?? "That change could not be applied.");
    },
    [commit, doc.id, toast],
  );

  /* ---------------- pointer handling ---------------- */

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button === 2) return;
      (event.target as Element).setPointerCapture?.(event.pointerId);
      const scene = toScene(event);

      // Middle mouse, space-drag or the hand tool always pans, whatever tool is
      // selected — panning has to be reachable mid-drawing.
      if (event.button === 1 || spaceRef.current || tool === "hand") {
        putGesture({
          type: "pan",
          startScreen: { x: event.clientX, y: event.clientY },
          startViewport: viewport,
        });
        return;
      }

      if (tool === "eraser") {
        const hit = hitTest(preview.nodes, scene, HIT_TOLERANCE / viewport.zoom, byId);
        if (hit) apply([{ op: "deleteNode", id: hit.id }], "Erase");
        return;
      }

      if (tool === "select") {
        const handle = selectedIds.length === 1 ? handleAt(scene, byId.get(selectedIds[0]), byId, viewport.zoom) : null;
        if (handle && selectedIds.length === 1) {
          const original = byId.get(selectedIds[0]);
          if (original && isBoxNode(original)) {
            putGesture({ type: "resize", handle, startScene: scene, original });
            return;
          }
        }

        const hit = hitTest(preview.nodes, scene, HIT_TOLERANCE / viewport.zoom, byId);
        if (hit) {
          const additive = event.shiftKey;
          let nextSelection: string[];
          if (additive) {
            nextSelection = selectedSet.has(hit.id)
              ? selectedIds.filter((id) => id !== hit.id)
              : [...selectedIds, hit.id];
          } else {
            nextSelection = selectedSet.has(hit.id) ? selectedIds : [hit.id];
          }
          setSelectedIds(nextSelection);

          const originals = nextSelection
            .map((id) => byId.get(id))
            .filter((n): n is CanvasNode => Boolean(n));
          putGesture({ type: "move", startScene: scene, originals, moved: false });
          return;
        }

        if (!event.shiftKey) setSelectedIds([]);
        putGesture({
          type: "marquee",
          startScene: scene,
          additive: event.shiftKey,
          current: null,
        });
        return;
      }

      if (tool === "connector") {
        const hit = hitTest(preview.nodes, scene, HIT_TOLERANCE / viewport.zoom, byId);
        if (!hit || !isBoxNode(hit)) {
          toast("info", "Start a connector on a shape.");
          return;
        }
        putGesture({
          type: "connector",
          fromNodeId: hit.id,
          draft: makeCanvasNode({
            kind: "connector",
            from: { nodeId: hit.id },
            to: { nodeId: null, x: scene.x, y: scene.y },
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
            arrowEnd: true,
            cornerRadius: roundingForStyle(style).cornerRadius,
          }),
        });
        return;
      }

      if (INK_TOOLS.includes(tool)) {
        const pressure = event.pressure > 0 ? event.pressure : 0.5;
        const points = [scene.x, scene.y, pressure];
        const { smoothing } = roundingForStyle(style);
        putGesture({
          type: "ink",
          points,
          draft: makeCanvasNode({
            kind: "ink",
            points,
            stroke: tool === "highlighter" ? "#fbbf24" : style.stroke,
            size: tool === "highlighter" ? 18 : Math.max(2, style.strokeWidth * 1.6),
            highlighter: tool === "highlighter",
            smoothing,
          }),
        });
        return;
      }

      const x = maybeSnap(scene.x, event);
      const y = maybeSnap(scene.y, event);

      if (LINE_TOOLS.includes(tool)) {
        const { cornerRadius } = roundingForStyle(style);
        putGesture({
          type: "create",
          startScene: { x, y },
          draft: makeCanvasNode({
            kind: "line",
            points: [x, y, x, y],
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
            arrowEnd: tool === "arrow",
            cornerRadius,
          }),
        });
        return;
      }

      if (BOX_TOOLS.includes(tool)) {
        const { radius } = roundingForStyle(style);
        const boxKind =
          tool === "text"
            ? "text"
            : tool === "frame"
              ? "frame"
              : tool === "ellipse"
                ? "ellipse"
                : tool === "diamond"
                  ? "diamond"
                  : "rect";
        putGesture({
          type: "create",
          startScene: { x, y },
          draft: makeCanvasNode({
            kind: boxKind,
            x,
            y,
            w: 0,
            h: 0,
            ...(tool === "text"
              ? { text: "", fontSize: style.fontSize, textColor: style.stroke }
              : tool === "frame"
                ? { name: `Frame ${nodes.filter((n) => n.kind === "frame").length + 1}` }
                : {
                    fill: style.fill,
                    stroke: style.stroke,
                    strokeWidth: style.strokeWidth,
                    fontSize: style.fontSize,
                    ...(tool === "rect" || tool === "diamond" ? { radius } : {}),
                  }),
          }),
        });
      }
    },
    [tool, toScene, viewport, preview.nodes, byId, selectedIds, selectedSet, style, nodes, apply, maybeSnap, toast, putGesture],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const gesture = gestureRef.current;
      const scene = toScene(event);

      if (!gesture) {
        if (tool === "select" || tool === "eraser") {
          const hit = hitTest(nodes, scene, HIT_TOLERANCE / viewport.zoom, byId);
          setHoverId(hit?.id ?? null);
        } else if (hoverId) {
          setHoverId(null);
        }
        return;
      }

      switch (gesture.type) {
        case "pan": {
          setViewport({
            ...gesture.startViewport,
            x: gesture.startViewport.x + (event.clientX - gesture.startScreen.x),
            y: gesture.startViewport.y + (event.clientY - gesture.startScreen.y),
          });
          return;
        }
        case "move": {
          putGesture({
            ...gesture,
            current: scene,
            altKey: event.altKey,
            moved:
              gesture.moved ||
              Math.hypot(scene.x - gesture.startScene.x, scene.y - gesture.startScene.y) > 2,
          });
          break;
        }
        case "resize": {
          putGesture({
            ...gesture,
            current: { x: maybeSnap(scene.x, event), y: maybeSnap(scene.y, event) },
          });
          break;
        }
        case "marquee": {
          putGesture({
            ...gesture,
            current: normalizeRect({
              x: gesture.startScene.x,
              y: gesture.startScene.y,
              w: scene.x - gesture.startScene.x,
              h: scene.y - gesture.startScene.y,
            }),
          });
          break;
        }
        case "create": {
          const x = maybeSnap(scene.x, event);
          const y = maybeSnap(scene.y, event);
          if (gesture.draft.kind === "line") {
            putGesture({
              ...gesture,
              draft: {
                ...gesture.draft,
                points: [gesture.startScene.x, gesture.startScene.y, x, y],
              },
            });
          } else if (isBoxNode(gesture.draft)) {
            const rect = normalizeRect({
              x: gesture.startScene.x,
              y: gesture.startScene.y,
              w: x - gesture.startScene.x,
              h: y - gesture.startScene.y,
            });
            putGesture({ ...gesture, draft: { ...gesture.draft, ...rect } });
          }
          break;
        }
        case "ink": {
          const pressure = event.pressure > 0 ? event.pressure : 0.5;
          const points = [...gesture.points, scene.x, scene.y, pressure];
          putGesture({
            ...gesture,
            points,
            draft: { ...gesture.draft, points } as CanvasNode,
          });
          break;
        }
        case "connector": {
          const hit = hitTest(nodes, scene, HIT_TOLERANCE / viewport.zoom, byId);
          const over = hit && isBoxNode(hit) && hit.id !== gesture.fromNodeId ? hit.id : null;
          putGesture({
            ...gesture,
            draft: {
              ...gesture.draft,
              to: { nodeId: over, anchor: "auto", x: scene.x, y: scene.y },
            } as CanvasNode,
          });
          setHoverId(over);
          break;
        }
      }
    },
    [toScene, tool, nodes, byId, viewport.zoom, hoverId, maybeSnap, putGesture],
  );

  const onPointerUp = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture) return;

    switch (gesture.type) {
      case "move": {
        const patches = movePatches(gesture);
        if (gesture.moved && patches) {
          apply(
            patches.map((p) => ({ op: "updateNode", id: p.id, patch: p.patch }) as CanvasOp),
            patches.length > 1 ? `Move ${patches.length} shapes` : "Move shape",
          );
        }
        break;
      }
      case "resize": {
        const patch = resizePatch(gesture);
        if (patch) {
          apply([{ op: "updateNode", id: patch[0].id, patch: patch[0].patch }], "Resize shape");
        }
        break;
      }
      case "marquee": {
        if (gesture.current) {
          const inside = nodesInRect(nodes, gesture.current, byId).map((n) => n.id);
          setSelectedIds((current) =>
            gesture.additive ? [...new Set([...current, ...inside])] : inside,
          );
        }
        break;
      }
      case "create": {
        const draft = gesture.draft;
        const tiny =
          draft.kind === "line"
            ? Math.hypot(draft.points[2] - draft.points[0], draft.points[3] - draft.points[1]) < 4
            : isBoxNode(draft) && (draft.w < 4 || draft.h < 4);

        // A click rather than a drag means "place a default-sized shape here",
        // which is what people expect from every other editor.
        const node = tiny && isBoxNode(draft) ? sizeToDefault(draft) : draft;
        if (tiny && draft.kind === "line") break;

        apply([{ op: "addNode", node: node as never }], `Add ${node.kind}`);
        setSelectedIds([node.id]);
        setTool("select");
        if (node.kind === "text") setEditingId(node.id);
        break;
      }
      case "ink": {
        if (gesture.points.length >= 6) {
          apply([{ op: "addNode", node: gesture.draft as never }], "Draw");
        }
        break;
      }
      case "connector": {
        const draft = gesture.draft as Extract<CanvasNode, { kind: "connector" }>;
        if (draft.to.nodeId) {
          apply([{ op: "addNode", node: draft as never }], "Connect shapes");
          setTool("select");
        }
        setHoverId(null);
        break;
      }
    }

    putGesture(null);
  }, [nodes, byId, apply, putGesture]);

  /* ---------------- wheel ---------------- */

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };

      if (event.ctrlKey || event.metaKey) {
        setViewport((current) => zoomAt(current, screen, current.zoom * Math.exp(-event.deltaY / 200)));
      } else {
        setViewport((current) => ({
          ...current,
          x: current.x - event.deltaX,
          y: current.y - event.deltaY,
        }));
      }
    };

    // Passive listeners cannot preventDefault, and without that the page
    // rubber-bands instead of the canvas panning.
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const isTyping = () => {
      const active = document.activeElement;
      return (
        active instanceof HTMLElement &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === " " && !isTyping()) {
        spaceRef.current = true;
        return;
      }
      if (isTyping() || event.metaKey || event.ctrlKey) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedIds.length === 0) return;
        event.preventDefault();
        apply(
          selectedIds.map((id) => ({ op: "deleteNode", id }) as CanvasOp),
          `Delete ${selectedIds.length} shape${selectedIds.length === 1 ? "" : "s"}`,
        );
        setSelectedIds([]);
        return;
      }

      if (event.key === "Escape") {
        setSelectedIds([]);
        setEditingId(null);
        setTool("select");
        return;
      }

      if (event.key.startsWith("Arrow") && selectedIds.length > 0) {
        event.preventDefault();
        const step = event.shiftKey ? GRID : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        apply(
          selectedIds
            .map((id) => byId.get(id))
            .filter((n): n is CanvasNode => Boolean(n))
            .map((node) => ({ op: "updateNode", id: node.id, patch: translated(node, dx, dy) }) as CanvasOp),
          "Nudge",
        );
        return;
      }

      const mapped = TOOL_BY_KEY[event.key.toLowerCase()];
      if (mapped) setTool(mapped);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") spaceRef.current = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [selectedIds, byId, apply]);

  /* ---------------- view actions ---------------- */

  const zoomTo = useCallback(
    (factor: number) => {
      setViewport((current) =>
        zoomAt(current, { x: size.width / 2, y: size.height / 2 }, current.zoom * factor),
      );
    },
    [size],
  );

  const fitToContent = useCallback(() => {
    const bounds = unionBounds(nodes.map((n) => nodeBounds(n, byId)));
    if (!bounds || size.width === 0) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const padding = 80;
    const zoom = clamp(
      Math.min(
        (size.width - padding * 2) / Math.max(bounds.w, 1),
        (size.height - padding * 2) / Math.max(bounds.h, 1),
      ),
      0.1,
      2,
    );
    setViewport({
      zoom,
      x: size.width / 2 - (bounds.x + bounds.w / 2) * zoom,
      y: size.height / 2 - (bounds.y + bounds.h / 2) * zoom,
    });
  }, [nodes, byId, size]);

  /* ---------------- text editing overlay ---------------- */

  const editingNode = editingId ? byId.get(editingId) : null;
  const editingBox = editingNode && isBoxNode(editingNode) ? nodeBounds(editingNode) : null;

  const selectionBounds = useMemo(() => {
    const rects = selectedIds
      .map((id) => byId.get(id))
      .filter((n): n is CanvasNode => Boolean(n))
      .map((n) => nodeBounds(n, byId));
    return unionBounds(rects);
  }, [selectedIds, byId]);

  const singleSelected = selectedIds.length === 1 ? byId.get(selectedIds[0]) : null;

  return (
    <div className="flex h-full flex-col">
      <CanvasToolbar
        tool={tool}
        onToolChange={setTool}
        style={style}
        onStyleChange={setStyle}
        zoom={viewport.zoom}
        onZoomIn={() => zoomTo(1.25)}
        onZoomOut={() => zoomTo(0.8)}
        onZoomReset={() => setViewport((v) => zoomAt(v, { x: size.width / 2, y: size.height / 2 }, 1))}
        onFit={fitToContent}
        background={doc.body.background}
        onBackgroundChange={(background) => apply([{ op: "setBackground", background }])}
      />

      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          className="absolute inset-0 touch-none overflow-hidden"
          style={{ cursor: cursorFor(tool, gesture?.type === "pan") }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={(event) => {
            const scene = toScene(event);
            const hit = hitTest(nodes, scene, HIT_TOLERANCE / viewport.zoom, byId);
            if (hit && (isBoxNode(hit) || hit.kind === "connector")) {
              setSelectedIds([hit.id]);
              setEditingId(hit.id);
            }
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <canvas
            ref={canvasRef}
            style={{ width: size.width, height: size.height }}
            aria-label="Drawing canvas"
            role="img"
          />

          {/* Resize handles live in the DOM so hit-testing and cursors are free. */}
          {selectionBounds && selectedIds.length === 1 && singleSelected && isBoxNode(singleSelected) && (
            <>
              {HANDLES.map((handle) => {
                const point = handlePosition(selectionBounds, handle);
                const screen = sceneToScreen(viewport, point.x, point.y);
                return (
                  <div
                    key={handle}
                    className="absolute rounded-[2px] border border-white bg-accent"
                    style={{
                      left: screen.x - HANDLE_SIZE / 2,
                      top: screen.y - HANDLE_SIZE / 2,
                      width: HANDLE_SIZE,
                      height: HANDLE_SIZE,
                      cursor: HANDLE_CURSORS[handle],
                    }}
                  />
                );
              })}
            </>
          )}

          {editingNode && editingBox && (
            <TextOverlay
              node={editingNode}
              bounds={editingBox}
              viewport={viewport}
              onCommit={(text) => {
                const key = editingNode.kind === "connector" ? "label" : "text";
                apply([{ op: "updateNode", id: editingNode.id, patch: { [key]: text } }], "Edit label");
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          )}
        </div>

        {selectedIds.length > 0 && (
          <CanvasInspector
            nodes={selectedIds.map((id) => byId.get(id)).filter((n): n is CanvasNode => Boolean(n))}
            onPatch={(patch) =>
              apply(
                selectedIds.map((id) => ({ op: "updateNode", id, patch }) as CanvasOp),
                "Restyle",
              )
            }
            onDelete={() => {
              apply(selectedIds.map((id) => ({ op: "deleteNode", id }) as CanvasOp), "Delete");
              setSelectedIds([]);
            }}
            onReorder={(direction) => {
              const id = selectedIds[0];
              const index = nodes.findIndex((n) => n.id === id);
              if (index === -1) return;
              const toIndex = direction === "front" ? nodes.length - 1 : direction === "back" ? 0 : index + (direction === "up" ? 1 : -1);
              apply([{ op: "reorderNode", id, toIndex: clamp(toIndex, 0, nodes.length - 1) }], "Reorder");
            }}
          />
        )}

        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
            <p className="text-sm text-faint">Pick a tool and draw</p>
            <p className="mt-1 text-xs text-faint">
              Or ask the assistant to sketch a diagram from another document
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Gesture maths
 * ------------------------------------------------------------------ */

interface NodePatch {
  id: string;
  patch: Record<string, unknown>;
}

function movePatches(gesture: Extract<Gesture, { type: "move" }>): NodePatch[] | null {
  if (!gesture.current) return null;
  const rawDx = gesture.current.x - gesture.startScene.x;
  const rawDy = gesture.current.y - gesture.startScene.y;
  const dx = gesture.altKey ? rawDx : snap(rawDx, GRID);
  const dy = gesture.altKey ? rawDy : snap(rawDy, GRID);
  if (dx === 0 && dy === 0) return [];
  return gesture.originals.map((node) => ({ id: node.id, patch: translated(node, dx, dy) }));
}

function resizePatch(gesture: Extract<Gesture, { type: "resize" }>): NodePatch[] | null {
  if (!gesture.current || !isBoxNode(gesture.original)) return null;
  const rect = resizeRect(
    { x: gesture.original.x, y: gesture.original.y, w: gesture.original.w, h: gesture.original.h },
    gesture.handle,
    gesture.current,
  );
  return [{ id: gesture.original.id, patch: rect }];
}

/** Translation is per-kind: boxes carry x/y, polylines carry point arrays. */
function translated(node: CanvasNode, dx: number, dy: number): Record<string, unknown> {
  if (isBoxNode(node)) return { x: node.x + dx, y: node.y + dy };

  if (node.kind === "line") {
    const points = node.points.slice();
    for (let i = 0; i + 1 < points.length; i += 2) {
      points[i] += dx;
      points[i + 1] += dy;
    }
    return { points };
  }

  if (node.kind === "ink") {
    const points = node.points.slice();
    for (let i = 0; i + 2 < points.length; i += 3) {
      points[i] += dx;
      points[i + 1] += dy;
    }
    return { points };
  }

  // Connectors bound to shapes follow them; only free endpoints move.
  return {
    from: node.from.nodeId ? node.from : { ...node.from, x: node.from.x + dx, y: node.from.y + dy },
    to: node.to.nodeId ? node.to : { ...node.to, x: node.to.x + dx, y: node.to.y + dy },
  };
}

function applyPatches(nodes: CanvasNode[], patches: NodePatch[]): CanvasNode[] {
  if (patches.length === 0) return nodes;
  const map = new Map(patches.map((p) => [p.id, p.patch]));
  return nodes.map((node) => {
    const patch = map.get(node.id);
    return patch ? ({ ...node, ...patch } as CanvasNode) : node;
  });
}

function sizeToDefault(node: CanvasNode): CanvasNode {
  if (!isBoxNode(node)) return node;
  const defaults =
    node.kind === "text"
      ? { w: 220, h: 36 }
      : node.kind === "frame"
        ? { w: 480, h: 320 }
        : { w: 160, h: 96 };
  return { ...node, ...defaults } as CanvasNode;
}

function handleAt(
  point: Point,
  node: CanvasNode | undefined,
  byId: Map<string, CanvasNode>,
  zoom: number,
): HandleId | null {
  if (!node || !isBoxNode(node)) return null;
  const bounds = nodeBounds(node, byId);
  const tolerance = (HANDLE_SIZE / 2 + 2) / zoom;
  for (const handle of HANDLES) {
    const position = handlePosition(bounds, handle);
    if (Math.abs(point.x - position.x) <= tolerance && Math.abs(point.y - position.y) <= tolerance) {
      return handle;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Overlays
 * ------------------------------------------------------------------ */

function TextOverlay({
  node,
  bounds,
  viewport,
  onCommit,
  onCancel,
}: {
  node: CanvasNode;
  bounds: Rect;
  viewport: Viewport;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const initial = node.kind === "connector" ? node.label : "text" in node ? node.text : "";
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const topLeft = sceneToScreen(viewport, bounds.x, bounds.y);
  const fontSize = ("fontSize" in node ? node.fontSize : 14) * viewport.zoom;
  const centred = node.kind !== "text";

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onCommit(value);
      }}
      className="absolute resize-none rounded border border-accent bg-bg p-1 text-ink outline-none"
      style={{
        left: topLeft.x,
        top: topLeft.y,
        width: Math.max(60, bounds.w * viewport.zoom),
        height: Math.max(24, bounds.h * viewport.zoom),
        fontSize: Math.max(9, fontSize),
        lineHeight: 1.35,
        textAlign: centred ? "center" : "left",
      }}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Theme
 * ------------------------------------------------------------------ */

function useCanvasTheme(): RenderTheme {
  const [theme, setTheme] = useState<RenderTheme>(readTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

function readTheme(): RenderTheme {
  if (typeof window === "undefined") {
    return {
      background: "#ffffff",
      grid: "#e6e8ec",
      gridStrong: "#d3d7de",
      accent: "#4f46e5",
      text: "#16181d",
      muted: "#61666e",
      selection: "#4f46e5",
    };
  }
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    background: read("--canvas-bg", "#ffffff"),
    grid: read("--canvas-grid", "#e6e8ec"),
    gridStrong: read("--canvas-grid-strong", "#d3d7de"),
    accent: read("--accent", "#4f46e5"),
    text: read("--text", "#16181d"),
    muted: read("--text-muted", "#61666e"),
    selection: read("--accent", "#4f46e5"),
  };
}
