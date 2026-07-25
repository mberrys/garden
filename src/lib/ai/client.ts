"use client";

import type { ProviderKind } from "./config";
import { streamMockReply, type MockRequest } from "./mock";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamOptions {
  provider: ProviderKind;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  /** Supplied when the mock provider is active; ignored for local models. */
  mock?: MockRequest;
  signal?: AbortSignal;
}

/**
 * Yields the assistant's reply incrementally, from whichever provider is live.
 *
 * Both providers produce the same thing — plain text that may contain an
 * `rr-ops` block — so everything downstream (parsing, validation, review,
 * accept/reject) has exactly one code path regardless of what is behind it.
 */
export async function* streamAssistant(options: StreamOptions): AsyncGenerator<string> {
  if (options.provider === "mock") {
    if (!options.mock) throw new Error("mock provider selected but no request context supplied");
    yield* streamMockReply(options.mock, options.signal);
    return;
  }

  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: options.messages,
      model: options.model,
      temperature: options.temperature,
    }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => null);
    throw new Error(detail ?? `The local model request failed (${response.status}).`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        const parsed = JSON.parse(data) as { delta?: string; error?: string };
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.delta) yield parsed.delta;
      }
    }
  } finally {
    // Cancelling releases the upstream connection when the user stops a reply
    // mid-stream; without it the local model keeps generating into the void.
    void reader.cancel().catch(() => {});
  }
}
