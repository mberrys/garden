/**
 * Local model configuration (server-side only).
 *
 * The app talks to whatever OpenAI-compatible server the user is running:
 * Ollama, LM Studio, llama.cpp's server, vLLM. One adapter covers all of them,
 * so "which local runtime" is a config value rather than a code path.
 */

export const DEFAULTS = {
  baseUrl: "http://localhost:11434/v1",
  model: "qwen2.5:7b-instruct",
} as const;

export interface AiConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  /** Milliseconds to wait for the local server before declaring it absent. */
  probeTimeoutMs: number;
  forceMock: boolean;
}

export function readConfig(): AiConfig {
  return {
    baseUrl: (process.env.AI_BASE_URL || DEFAULTS.baseUrl).replace(/\/+$/, ""),
    model: process.env.AI_MODEL || DEFAULTS.model,
    // Local servers ignore this, but LM Studio and vLLM can be configured to
    // require it, and the OpenAI client shape expects the header to exist.
    apiKey: process.env.AI_API_KEY || "local",
    probeTimeoutMs: Number(process.env.AI_PROBE_TIMEOUT_MS || 1500),
    forceMock: process.env.RR_FORCE_MOCK_AI === "1",
  };
}

export type ProviderKind = "local" | "mock";

export interface ProviderStatus {
  provider: ProviderKind;
  /** Model that will actually serve requests. */
  model: string;
  baseUrl: string;
  /** Models the local server reports, for the picker. Empty when mocked. */
  available: string[];
  /** Why the local provider was not used, when it was not. */
  reason?: string;
}
