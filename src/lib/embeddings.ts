import "server-only";
import { embedTexts } from "@/server/ai/provider";

/**
 * Embedding for one piece of text, from the configured provider
 * (see src/server/ai/provider.ts). Prefer `embedTexts` for batches: one
 * request per 50 texts instead of one each, which matters on rate-limited
 * free tiers.
 */
export async function getEmbeddings(text: string): Promise<number[]> {
  if (!text?.trim()) throw new Error("Text input is required and must be a non-empty string");
  const [vector] = await embedTexts([text]);
  return vector!;
}

export { embedTexts };
