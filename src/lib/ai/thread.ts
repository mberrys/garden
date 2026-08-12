"use client";

import { create } from "zustand";
import type { Doc, DocKind } from "@/lib/docs/schema";
import { newMessageId, newSuggestionId } from "@/lib/docs/ids";
import { describeOperation, type AnyOp, type OpOf } from "@/lib/ops";
import { useWorkspace } from "@/lib/store/workspace";
import { getPacket } from "@/lib/packets/registry";
import { streamAssistant, type ChatMessage } from "./client";
import { parseOpsFromReply, stripOpsBlocks } from "./ops-block";
import { repairTurn, systemPrompt, userTurn } from "./prompt";
import type { MockRequest } from "./mock";
import type { ProviderKind } from "./config";

/**
 * Conversation state and the suggestion lifecycle.
 *
 * A suggestion is the unit of AI collaboration in this app: a validated batch
 * of operations, held out of the document until the user accepts it. Accepting
 * routes through the ordinary `commit` path, which means an AI edit is undoable
 * with ctrl+Z exactly like a hand edit, and rejecting costs nothing because the
 * document was never touched.
 */

export type SuggestionStatus = "pending" | "accepted" | "rejected" | "failed";

export interface Suggestion {
  id: string;
  docId: string;
  kind: DocKind;
  ops: AnyOp[];
  summaries: string[];
  status: SuggestionStatus;
  /** Populated when validation or application failed. */
  errors?: string[];
}

export interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Set while the assistant message is still streaming. */
  streaming?: boolean;
  suggestionId?: string;
  error?: string;
  /** True when this reply came from the scripted mock rather than a model. */
  mocked?: boolean;
}

interface Thread {
  messages: ThreadMessage[];
  busy: boolean;
}

interface ThreadState {
  threads: Record<string, Thread>;
  suggestions: Record<string, Suggestion>;
  controllers: Record<string, AbortController>;

  send: (options: SendOptions) => Promise<void>;
  stop: (docId: string) => void;
  clear: (docId: string) => void;
  accept: (suggestionId: string) => void;
  reject: (suggestionId: string) => void;
  thread: (docId: string) => Thread;
}

export interface SendOptions {
  doc: Doc;
  request: string;
  provider: ProviderKind;
  model?: string;
  /** Documents offered as source material — the other open pane, usually. */
  companions?: Doc[];
  /** Where accepted operations land; defaults to the active document. */
  targetDocId?: string;
  /** Label shown instead of the raw request, used by recipes. */
  displayRequest?: string;
}

const emptyThread = (): Thread => ({ messages: [], busy: false });

export const useThreads = create<ThreadState>((set, get) => ({
  threads: {},
  suggestions: {},
  controllers: {},

  thread: (docId) => get().threads[docId] ?? emptyThread(),

  send: async (options) => {
    const { doc, request, provider, model, companions = [] } = options;
    const docId = doc.id;
    const targetDocId = options.targetDocId ?? docId;
    const workspace = useWorkspace.getState();
    const targetDoc = workspace.docs[targetDocId] ?? doc;

    const existing = get().threads[docId] ?? emptyThread();
    if (existing.busy) return;

    const controller = new AbortController();
    const userMessage: ThreadMessage = {
      id: newMessageId(),
      role: "user",
      content: options.displayRequest ?? request,
    };
    const assistantMessage: ThreadMessage = {
      id: newMessageId(),
      role: "assistant",
      content: "",
      streaming: true,
      mocked: provider === "mock",
    };

    set({
      threads: {
        ...get().threads,
        [docId]: { messages: [...existing.messages, userMessage, assistantMessage], busy: true },
      },
      controllers: { ...get().controllers, [docId]: controller },
    });

    const selection = workspace.selection[docId];
    const targetSelection =
      targetDocId === docId ? selection : workspace.selection[targetDocId];
    const companionContexts = companions.map((c) => ({
      doc: c,
      selection: workspace.selection[c.id],
    }));

    const packet = workspace.seedPacketId ? getPacket(workspace.seedPacketId) : undefined;
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt(targetDoc.kind, packet?.systemPromptAddenda) },
      {
        role: "user",
        content: userTurn({
          doc: targetDoc,
          request,
          selection: targetSelection,
          companions: companionContexts,
        }),
      },
    ];

    const mock: MockRequest = {
      doc: targetDoc,
      request,
      selection: targetSelection,
      companions: companionContexts,
    };

    const patch = (updater: (message: ThreadMessage) => ThreadMessage) => {
      const thread = get().threads[docId];
      if (!thread) return;
      set({
        threads: {
          ...get().threads,
          [docId]: {
            ...thread,
            messages: thread.messages.map((m) => (m.id === assistantMessage.id ? updater(m) : m)),
          },
        },
      });
    };

    try {
      let reply = await collect(
        streamAssistant({ provider, messages, model, mock, signal: controller.signal }),
        (text) => patch((m) => ({ ...m, content: text })),
      );

      let outcome = parseOpsFromReply(targetDoc.kind, reply);

      // One repair round-trip. A model that emits an invalid batch twice will
      // not get it right on a third attempt, and the user is sitting there.
      if (outcome.status === "invalid") {
        patch((m) => ({ ...m, content: `${stripOpsBlocks(reply)}\n\n_Fixing invalid operations…_` }));

        const repairMessages: ChatMessage[] = [
          ...messages,
          { role: "assistant", content: reply },
          { role: "user", content: repairTurn(outcome.errors, outcome.raw) },
        ];

        const repaired = await collect(
          streamAssistant({
            provider,
            messages: repairMessages,
            model,
            mock: { ...mock, request: `${request} (retry)` },
            signal: controller.signal,
          }),
          () => {},
        );

        const repairedOutcome = parseOpsFromReply(targetDoc.kind, repaired);
        if (repairedOutcome.status === "ok") {
          reply = repaired;
          outcome = repairedOutcome;
        } else if (repairedOutcome.status === "invalid") {
          outcome = { status: "invalid", errors: repairedOutcome.errors, raw: repairedOutcome.raw };
        }
      }

      let suggestionId: string | undefined;
      let error: string | undefined;

      if (outcome.status === "ok") {
        const suggestion: Suggestion = {
          id: newSuggestionId(),
          docId: targetDocId,
          kind: targetDoc.kind,
          ops: outcome.ops as AnyOp[],
          summaries: (outcome.ops as AnyOp[]).map(describeOperation),
          status: "pending",
        };
        suggestionId = suggestion.id;
        set({ suggestions: { ...get().suggestions, [suggestion.id]: suggestion } });
      } else if (outcome.status === "invalid") {
        error = `The model proposed changes that did not validate:\n${outcome.errors
          .map((e) => `• ${e}`)
          .join("\n")}`;
      }

      patch((m) => ({
        ...m,
        content: stripOpsBlocks(reply) || (suggestionId ? "Proposed the changes below." : reply),
        streaming: false,
        suggestionId,
        error,
      }));
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      patch((m) => ({
        ...m,
        streaming: false,
        content: m.content || (aborted ? "_Stopped._" : ""),
        error: aborted ? undefined : err instanceof Error ? err.message : String(err),
      }));
    } finally {
      const thread = get().threads[docId];
      const { [docId]: _dropped, ...controllers } = get().controllers;
      if (thread) {
        set({ threads: { ...get().threads, [docId]: { ...thread, busy: false } }, controllers });
      } else {
        set({ controllers });
      }
    }
  },

  stop: (docId) => {
    get().controllers[docId]?.abort();
  },

  clear: (docId) => {
    get().controllers[docId]?.abort();
    set({ threads: { ...get().threads, [docId]: emptyThread() } });
  },

  accept: (suggestionId) => {
    const suggestion = get().suggestions[suggestionId];
    if (!suggestion || suggestion.status !== "pending") return;

    const workspace = useWorkspace.getState();
    const result = workspace.commit(
      suggestion.docId,
      suggestion.ops as OpOf<DocKind>[],
      { label: `AI: ${suggestion.summaries[0] ?? "changes"}` },
    );

    if (!result.ok) {
      set({
        suggestions: {
          ...get().suggestions,
          [suggestionId]: {
            ...suggestion,
            status: "failed",
            errors: [result.error ?? "the change could not be applied"],
          },
        },
      });
      workspace.toast("error", `Could not apply: ${result.error}`);
      return;
    }

    set({
      suggestions: { ...get().suggestions, [suggestionId]: { ...suggestion, status: "accepted" } },
    });
    workspace.toast(
      "success",
      `Applied ${suggestion.ops.length} change${suggestion.ops.length === 1 ? "" : "s"}. Undo with ${
        modKeyLabel()
      }+Z.`,
    );
  },

  reject: (suggestionId) => {
    const suggestion = get().suggestions[suggestionId];
    if (!suggestion || suggestion.status !== "pending") return;
    set({
      suggestions: { ...get().suggestions, [suggestionId]: { ...suggestion, status: "rejected" } },
    });
  },
}));

async function collect(
  stream: AsyncGenerator<string>,
  onProgress: (text: string) => void,
): Promise<string> {
  let text = "";
  let lastPaint = 0;
  for await (const chunk of stream) {
    text += chunk;
    // Repainting on every token thrashes React for no visible benefit; ~20fps
    // is indistinguishable from per-token and far cheaper.
    const now = Date.now();
    if (now - lastPaint > 50) {
      lastPaint = now;
      onProgress(text);
    }
  }
  onProgress(text);
  return text;
}

export function modKeyLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";
}
