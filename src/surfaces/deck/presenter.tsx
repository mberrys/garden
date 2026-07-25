"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { SLIDE_H, SLIDE_W, type DeckDoc } from "@/lib/docs/schema";
import { IconButton } from "@/components/ui";
import { SlideView } from "./slide-view";

/**
 * Full-surface presentation mode with speaker notes.
 *
 * Deliberately fills the pane rather than the browser viewport, so a deck can
 * be presented in one pane while the source PDF stays visible in the other —
 * which is the point of the split view. The fullscreen button hands the pane to
 * the browser's own fullscreen when a real presentation is wanted.
 */
export function Presenter({
  deck,
  startIndex,
  onExit,
}: {
  deck: DeckDoc;
  startIndex: number;
  onExit: (finalIndex: number) => void;
}) {
  const slides = deck.body.slides;
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, slides.length - 1)));
  const [showNotes, setShowNotes] = useState(true);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (delta: number) => setIndex((i) => Math.max(0, Math.min(i + delta, slides.length - 1))),
    [slides.length],
  );

  /**
   * The key handler is kept in a ref and subscribed once. Re-subscribing on
   * every render is a real hazard here: a listener removed during the dispatch
   * of the very keydown it was meant to handle simply never fires, which is how
   * Escape silently stopped exiting the presentation.
   */
  const handlerRef = useRef<(event: KeyboardEvent) => void>(() => {});

  useEffect(() => {
    handlerRef.current = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
        case " ":
        case "PageDown":
          event.preventDefault();
          go(1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          event.preventDefault();
          go(-1);
          break;
        case "Home":
          setIndex(0);
          break;
        case "End":
          setIndex(slides.length - 1);
          break;
        case "n":
          setShowNotes((v) => !v);
          break;
        case "Escape":
          onExit(index);
          break;
      }
    };
  }, [go, index, slides.length, onExit]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handlerRef.current(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [showNotes]);

  const slide = slides[index];
  const scale = size.width > 0 ? Math.min(size.width / SLIDE_W, size.height / SLIDE_H) : 0;

  if (!slide) return null;

  return (
    <div ref={containerRef} className="flex h-full flex-col bg-black">
      <div ref={stageRef} className="flex min-h-0 flex-1 items-center justify-center">
        {scale > 0 && <SlideView slide={slide} theme={deck.body.theme} scale={scale} />}
      </div>

      {showNotes && (
        <div className="max-h-40 shrink-0 overflow-y-auto border-t border-white/10 bg-neutral-900 px-6 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
            {slide.notes || <span className="text-neutral-600">No notes for this slide.</span>}
          </p>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2 border-t border-white/10 bg-neutral-950 px-3 py-1.5 text-neutral-400">
        <IconButton
          label="Previous slide"
          size="sm"
          disabled={index === 0}
          onClick={() => go(-1)}
          className="text-neutral-400 hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft size={15} />
        </IconButton>
        <span className="min-w-14 text-center text-xs tabular-nums">
          {index + 1} / {slides.length}
        </span>
        <IconButton
          label="Next slide"
          size="sm"
          disabled={index === slides.length - 1}
          onClick={() => go(1)}
          className="text-neutral-400 hover:bg-white/10 hover:text-white"
        >
          <ChevronRight size={15} />
        </IconButton>

        <button
          type="button"
          onClick={() => setShowNotes((v) => !v)}
          className="ml-2 rounded px-2 py-0.5 text-xs hover:bg-white/10 hover:text-white"
        >
          {showNotes ? "Hide notes" : "Show notes"} (N)
        </button>
        <button
          type="button"
          onClick={() => {
            const element = containerRef.current;
            if (!element) return;
            if (document.fullscreenElement) void document.exitFullscreen();
            else void element.requestFullscreen().catch(() => {});
          }}
          className="rounded px-2 py-0.5 text-xs hover:bg-white/10 hover:text-white"
        >
          Fullscreen
        </button>

        <IconButton
          label="Exit presentation"
          size="sm"
          onClick={() => onExit(index)}
          className="ml-auto text-neutral-400 hover:bg-white/10 hover:text-white"
        >
          <X size={15} />
        </IconButton>
      </div>
    </div>
  );
}
