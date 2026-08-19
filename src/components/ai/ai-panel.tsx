"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Send, Sparkles, Square, X } from "lucide-react";
import { createDoc } from "@/lib/docs/create-doc";
import type { Doc, DocKind } from "@/lib/docs/schema";
import { getSurface } from "@/lib/surfaces";
import { useWorkspace } from "@/lib/store/workspace";
import { useThreads } from "@/lib/ai/thread";
import { recipesFor, type Recipe } from "@/lib/ai/recipes";
import { Button, EmptyState, IconButton, cx } from "../ui";
import { DocIcon } from "../doc-icon";
import { SuggestionCard } from "./suggestion-card";
import { useProvider } from "./provider-badge";

export function AiPanel({ onClose }: { onClose: () => void }) {
  const activeDocId = useWorkspace((s) => s.panes[s.activePane].activeDocId);
  const doc = useWorkspace((s) => (activeDocId ? s.docs[activeDocId] : null));
  const docs = useWorkspace((s) => s.docs);
  const panes = useWorkspace((s) => s.panes);
  const addDoc = useWorkspace((s) => s.addDoc);
  const openDoc = useWorkspace((s) => s.openDoc);

  const status = useProvider((s) => s.status);
  const threads = useThreads((s) => s.threads);
  const send = useThreads((s) => s.send);
  const stop = useThreads((s) => s.stop);
  const clear = useThreads((s) => s.clear);

  const seedPacketId = useWorkspace((s) => s.seedPacketId);

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const thread = activeDocId ? threads[activeDocId] : undefined;
  // Memoised so the empty-thread fallback is not a fresh array each render,
  // which would re-fire the scroll effect on every keystroke elsewhere.
  const messages = useMemo(() => thread?.messages ?? [], [thread?.messages]);
  const busy = thread?.busy ?? false;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  /**
   * Finds where a recipe's output should land: an already-open document of the
   * right kind, or a new one opened beside the source so both are visible.
   */
  const resolveTarget = useCallback(
    (kind: DocKind, sourceDoc: Doc): string => {
      if (kind === sourceDoc.kind) return sourceDoc.id;

      const openElsewhere = [...panes[0].docIds, ...panes[1].docIds]
        .map((id) => docs[id])
        .find((candidate) => candidate?.kind === kind && candidate.id !== sourceDoc.id);
      if (openElsewhere) return openElsewhere.id;

      const recipe = recipesFor(sourceDoc.kind, seedPacketId).find((r) => r.target === kind);
      const title = recipe?.newTitle?.(sourceDoc.title) ?? `${sourceDoc.title} — ${kind}`;
      const created = createDoc(kind, title);
      addDoc(created, { open: false });
      openDoc(created.id, 1, { focus: false });
      return created.id;
    },
    [panes, docs, addDoc, openDoc, seedPacketId],
  );

  const companionsFor = useCallback(
    (sourceDoc: Doc, targetDocId: string): Doc[] =>
      targetDocId === sourceDoc.id ? [] : [sourceDoc],
    [],
  );

  const submit = useCallback(
    (request: string, recipe?: Recipe) => {
      if (!doc || !status || !request.trim()) return;
      const targetDocId = recipe ? resolveTarget(recipe.target, doc) : doc.id;
      void send({
        doc,
        request,
        provider: status.provider,
        model: status.model,
        targetDocId,
        companions: companionsFor(doc, targetDocId),
        displayRequest: recipe?.label,
      });
      setDraft("");
    },
    [doc, status, send, resolveTarget, companionsFor],
  );

  const recipes = useMemo(
    () => (doc ? recipesFor(doc.kind, seedPacketId) : []),
    [doc, seedPacketId],
  );

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-line bg-sunken">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <Sparkles size={14} className="text-accent" />
        <span className="flex-1 text-sm font-medium text-ink">Assistant</span>
        {activeDocId && messages.length > 0 && (
          <IconButton label="Clear conversation" size="sm" onClick={() => clear(activeDocId)}>
            <RotateCcw size={13} />
          </IconButton>
        )}
        <IconButton label="Hide assistant" size="sm" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>

      {!doc ? (
        <EmptyState
          title="No document open"
          hint="Open a document and the assistant can read it, propose changes, and build new documents from it."
        />
      ) : (
        <>
          <div className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-xs text-muted">
            <DocIcon kind={doc.kind} size={12} />
            <span className="min-w-0 flex-1 truncate" title={doc.title}>
              {doc.title}
            </span>
            <span className="shrink-0 text-faint">{getSurface(doc.kind).label}</span>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-muted">
                  Ask for a change and the assistant proposes it as a reviewable edit — nothing
                  applies until you accept it.
                </p>
                {status?.provider === "mock" && (
                  <p className="rounded-md border border-transparent bg-warn-soft px-2.5 py-2 text-[11px] leading-relaxed text-warn">
                    No local model is running, so replies are scripted rather than generated. They
                    still produce real, valid edits — good for trying the flow. Start an
                    OpenAI-compatible server (<code>ollama serve</code>) and click the badge in the
                    header to re-check.
                  </p>
                )}
                <div className="space-y-1">
                  {recipes.map((recipe) => (
                    <button
                      key={recipe.id}
                      type="button"
                      onClick={() => submit(recipe.prompt, recipe)}
                      className="flex w-full flex-col gap-0.5 rounded-md border border-line bg-raised px-2.5 py-1.5 text-left transition-colors hover:border-accent hover:bg-hover"
                    >
                      <span className="flex items-center gap-1.5 text-xs font-medium text-ink">
                        {recipe.label}
                        {recipe.target !== doc.kind && (
                          <>
                            <span className="text-faint">→</span>
                            <DocIcon kind={recipe.target} size={11} />
                          </>
                        )}
                      </span>
                      <span className="text-[11px] leading-snug text-muted">{recipe.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div key={message.id}>
                    {message.role === "user" ? (
                      <div className="ml-4 rounded-lg rounded-br-sm bg-accent-soft px-2.5 py-1.5 text-xs leading-relaxed text-ink">
                        {message.content}
                      </div>
                    ) : (
                      <div className="text-xs leading-relaxed text-ink">
                        {message.content && (
                          <div className="whitespace-pre-wrap">{message.content}</div>
                        )}
                        {message.streaming && (
                          <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-accent align-middle" />
                        )}
                        {message.suggestionId && (
                          <SuggestionCard suggestionId={message.suggestionId} />
                        )}
                        {message.error && (
                          <div className="mt-2 whitespace-pre-wrap rounded-md bg-danger-soft px-2.5 py-2 text-[11px] leading-relaxed text-danger">
                            {message.error}
                          </div>
                        )}
                        {message.mocked && !message.streaming && (
                          <div className="mt-1 text-[10px] uppercase tracking-wide text-faint">
                            scripted reply
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {messages.length > 0 && recipes.length > 0 && (
            <div className="flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5">
              {recipes.map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  disabled={busy}
                  onClick={() => submit(recipe.prompt, recipe)}
                  className="shrink-0 rounded-full border border-line bg-raised px-2 py-0.5 text-[11px] text-muted transition-colors hover:border-accent hover:text-ink disabled:opacity-40"
                >
                  {recipe.label}
                </button>
              ))}
            </div>
          )}

          <div className="shrink-0 border-t border-line p-2">
            <div
              className={cx(
                "flex items-end gap-1.5 rounded-lg border bg-bg p-1.5",
                busy ? "border-line" : "border-line focus-within:border-accent",
              )}
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                disabled={busy}
                placeholder={`Ask about this ${getSurface(doc.kind).label.toLowerCase()}…`}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(draft);
                  }
                }}
                className="max-h-36 min-h-6 flex-1 resize-none bg-transparent px-1 text-xs leading-relaxed text-ink outline-none placeholder:text-faint"
              />
              {busy ? (
                <IconButton
                  label="Stop generating"
                  size="sm"
                  onClick={() => activeDocId && stop(activeDocId)}
                >
                  <Square size={12} />
                </IconButton>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!draft.trim()}
                  onClick={() => submit(draft)}
                  aria-label="Send"
                  className="h-6 w-6 p-0"
                >
                  <Send size={12} />
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
