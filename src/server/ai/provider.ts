import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";

/**
 * One place that decides which AI provider the app talks to.
 *
 * All supported providers speak the OpenAI API, so a single client with a
 * different base URL covers them:
 *   - openai : api.openai.com (default when OPENAI_API_KEY is set)
 *   - gemini : Google's OpenAI-compatible endpoint (free tier available;
 *              NOTE: free-tier content is used by Google to improve its products)
 *   - custom : any other OpenAI-compatible endpoint (OpenRouter, Groq, Moonshot…)
 *
 * Environment
 *   AI_PROVIDER         openai | gemini | custom   (auto-detected if unset)
 *   AI_API_KEY          overrides OPENAI_API_KEY / GEMINI_API_KEY
 *   AI_BASE_URL         required for custom, optional override otherwise
 *   AI_MODEL            model for longer work (summaries, chat, drafts)
 *   AI_FAST_MODEL       model for quick classification (organizer rules)
 *   EMBEDDING_PROVIDER  defaults to AI_PROVIDER
 *   EMBEDDING_MODEL / EMBEDDING_API_KEY / EMBEDDING_BASE_URL
 */

export type ProviderId = "openai" | "gemini" | "custom";

const PRESETS: Record<ProviderId, { baseURL?: string; keyEnv?: string; smart: string; fast: string; embed: string }> = {
  openai: { keyEnv: "OPENAI_API_KEY", smart: "gpt-4o-mini", fast: "gpt-4o-mini", embed: "text-embedding-ada-002" },
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyEnv: "GEMINI_API_KEY",
    // Flash-Lite has the most generous free-tier limits.
    smart: "gemini-3.5-flash-lite",
    fast: "gemini-3.5-flash-lite",
    embed: "gemini-embedding-001",
  },
  custom: { smart: "", fast: "", embed: "" },
};

/** Vector size of the search index schema (src/lib/orama.ts). */
export const EMBEDDING_DIMENSIONS = 1536;

function resolveProvider(value: string | undefined): ProviderId {
  const v = value?.trim().toLowerCase();
  if (v === "openai" || v === "gemini" || v === "custom") return v;
  if (!process.env.OPENAI_API_KEY && process.env.GEMINI_API_KEY) return "gemini";
  return "openai";
}

function settings(kind: "chat" | "embed") {
  const provider = resolveProvider(kind === "embed" ? process.env.EMBEDDING_PROVIDER ?? process.env.AI_PROVIDER : process.env.AI_PROVIDER);
  const preset = PRESETS[provider];
  const apiKey =
    (kind === "embed" ? process.env.EMBEDDING_API_KEY : undefined) ??
    process.env.AI_API_KEY ??
    (preset.keyEnv ? process.env[preset.keyEnv] : undefined);
  const baseURL = (kind === "embed" ? process.env.EMBEDDING_BASE_URL : undefined) ?? process.env.AI_BASE_URL ?? preset.baseURL;
  return { provider, preset, apiKey, baseURL };
}

function client(kind: "chat" | "embed") {
  const { provider, apiKey, baseURL } = settings(kind);
  if (!apiKey) {
    const hint = provider === "gemini" ? "GEMINI_API_KEY" : provider === "openai" ? "OPENAI_API_KEY" : "AI_API_KEY";
    throw new AiNotConfiguredError(`AI is not configured. Set ${hint} (and AI_PROVIDER) in your environment.`);
  }
  if (provider === "custom" && !baseURL) throw new AiNotConfiguredError("AI_PROVIDER=custom needs AI_BASE_URL.");
  return createOpenAI({
    apiKey,
    baseURL,
    // "strict" only for OpenAI itself; other providers ignore OpenAI-only fields.
    compatibility: provider === "openai" ? "strict" : "compatible",
  });
}

export class AiNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

export function isAiConfigured() {
  const { apiKey, provider, baseURL } = settings("chat");
  return !!apiKey && (provider !== "custom" || !!baseURL);
}

/**
 * Language model for a task. "fast" = high-volume classification,
 * "smart" = summaries, chat, drafting.
 */
export function chatModel(tier: "fast" | "smart" = "smart") {
  const { preset } = settings("chat");
  const id =
    (tier === "fast" ? process.env.AI_FAST_MODEL : undefined) ?? process.env.AI_MODEL ?? (tier === "fast" ? preset.fast : preset.smart);
  if (!id) throw new AiNotConfiguredError("Set AI_MODEL for the custom AI provider.");
  return client("chat")(id);
}

/** Retries with backoff on 429/5xx, which matters on rate-limited free tiers. */
export const AI_RETRIES = 4;

export function embeddingModelId() {
  const { preset } = settings("embed");
  return process.env.EMBEDDING_MODEL ?? preset.embed;
}

/** How many embedding requests may run at once (free tiers are rate limited). */
export function embeddingConcurrency() {
  const { provider } = settings("embed");
  return provider === "openai" ? 6 : 1;
}

/**
 * Fit a vector to the index size. Models trained with Matryoshka
 * representation (e.g. gemini-embedding-001, text-embedding-3-*) keep their
 * meaning when truncated, as long as the result is re-normalised.
 */
function fit(vector: number[]) {
  if (vector.length === EMBEDDING_DIMENSIONS) return vector;
  if (vector.length < EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding model returned ${vector.length} dimensions; the search index needs ${EMBEDDING_DIMENSIONS}. Choose a model with at least that many.`,
    );
  }
  const cut = vector.slice(0, EMBEDDING_DIMENSIONS);
  const norm = Math.hypot(...cut) || 1;
  return cut.map((v) => v / norm);
}

/** Embed many texts in as few requests as possible (batches of 50). */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = client("embed").embedding(embeddingModelId());
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 50) {
    const values = texts.slice(i, i + 50).map((t) => t.replace(/\s+/g, " ").trim().slice(0, 8000) || " ");
    const { embeddings } = await embedMany({ model, values, maxRetries: AI_RETRIES });
    out.push(...embeddings.map(fit));
  }
  return out;
}
