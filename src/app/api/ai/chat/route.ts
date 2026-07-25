import { readConfig } from "@/lib/ai/config";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ChatRequest {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  model?: string;
  temperature?: number;
}

/**
 * Streaming proxy to the user's local OpenAI-compatible server.
 *
 * The proxy exists so the browser never needs the base URL or key, and so a
 * server bound to localhost (the default for Ollama and LM Studio) is reachable
 * without CORS configuration on the user's side.
 *
 * Response is a plain `text/event-stream` of `data: {"delta": "..."}` lines
 * ending with `data: [DONE]` — the upstream SSE format is normalised here so
 * the client does not have to care which runtime is behind it.
 */
export async function POST(request: Request) {
  const config = readConfig();

  if (config.forceMock) {
    return jsonError(503, "Local AI is disabled (RR_FORCE_MOCK_AI is set).");
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return jsonError(400, "Request body must be JSON.");
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError(400, "`messages` must be a non-empty array.");
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: body.model || config.model,
        messages: body.messages,
        temperature: body.temperature ?? 0.2,
        stream: true,
      }),
      signal: request.signal,
    });
  } catch (err) {
    return jsonError(
      502,
      `Could not reach the local model at ${config.baseUrl}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return jsonError(
      upstream.status || 502,
      `The local model returned ${upstream.status}. ${truncate(detail, 400)}`,
    );
  }

  return new Response(normaliseStream(upstream.body), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/**
 * Converts an upstream OpenAI-style SSE stream into `{delta}` events.
 *
 * Chunk boundaries do not respect line boundaries, so partial lines are carried
 * across reads — dropping them corrupts multi-byte characters and truncates
 * JSON mid-object.
 */
function normaliseStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = source.getReader();
  let buffer = "";

  const send = (controller: ReadableStreamDefaultController<Uint8Array>, payload: unknown) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  };

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();

      if (done) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data) as {
            choices?: { delta?: { content?: string }; message?: { content?: string } }[];
            error?: { message?: string };
          };
          if (parsed.error?.message) {
            send(controller, { error: parsed.error.message });
            continue;
          }
          const delta =
            parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? "";
          if (delta) send(controller, { delta });
        } catch {
          // A malformed chunk from the upstream server is not worth killing the
          // whole stream over; skip it and keep reading.
        }
      }
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
