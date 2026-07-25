import { NextResponse } from "next/server";
import { readConfig, type ProviderStatus } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

/**
 * Reports which provider will serve AI requests.
 *
 * The client shows this verbatim in the header badge. That matters: a scripted
 * mock reply must never be mistaken for something a real model said, so the
 * distinction is surfaced in the UI rather than buried in a log.
 */
export async function GET() {
  const config = readConfig();

  if (config.forceMock) {
    return NextResponse.json<ProviderStatus>({
      provider: "mock",
      model: "scripted-mock",
      baseUrl: config.baseUrl,
      available: [],
      reason: "RR_FORCE_MOCK_AI is set",
    });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.probeTimeoutMs);
    const response = await fetch(`${config.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);

    if (!response.ok) {
      return NextResponse.json<ProviderStatus>({
        provider: "mock",
        model: "scripted-mock",
        baseUrl: config.baseUrl,
        available: [],
        reason: `local server answered ${response.status}`,
      });
    }

    const body = (await response.json()) as { data?: { id?: string }[] };
    const available = (body.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string")
      .sort();

    // Prefer the configured model; fall back to whatever the server has loaded
    // so a running Ollama with a different model still works out of the box.
    const model = available.includes(config.model) ? config.model : (available[0] ?? config.model);

    return NextResponse.json<ProviderStatus>({
      provider: "local",
      model,
      baseUrl: config.baseUrl,
      available,
    });
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? `no response within ${config.probeTimeoutMs}ms`
        : "no local server reachable";
    return NextResponse.json<ProviderStatus>({
      provider: "mock",
      model: "scripted-mock",
      baseUrl: config.baseUrl,
      available: [],
      reason,
    });
  }
}
