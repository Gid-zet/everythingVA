import { create, insert, search, count, type AnyOrama } from "@orama/orama";
import { persist, restore } from "@orama/plugin-data-persistence";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { getEmbeddings, embedTexts } from "@/lib/embeddings";
import { EMBEDDING_DIMENSIONS, embeddingModelId } from "@/server/ai/provider";
import { turndown } from "@/lib/turndown";

/**
 * Per-account search index (Orama), persisted in Account.binaryIndex.
 *
 * Vectors from different embedding models aren't comparable, so the stored
 * index records which model built it:
 *   { v: 2, embeddingModel, data }   (legacy rows: the raw persisted string,
 *                                     built with text-embedding-ada-002)
 * If the configured model differs, the index starts fresh (`stale = true`)
 * and is rebuilt from the database by `rebuild()`.
 */
const LEGACY_MODEL = "text-embedding-ada-002";

type Stored = { v: 2; embeddingModel: string; data: string };

const SCHEMA = {
  title: "string",
  body: "string",
  rawBody: "string",
  from: "string",
  to: "string[]",
  sentAt: "string",
  embeddings: `vector[${EMBEDDING_DIMENSIONS}]`,
  threadId: "string",
} as const;

export class OramaManager {
  // @ts-ignore assigned in initialize()
  private orama: AnyOrama;
  private accountId: string;
  /** True when the stored index was built with a different embedding model. */
  stale = false;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  async initialize() {
    const account = await db.account.findUnique({ where: { id: this.accountId }, select: { binaryIndex: true } });
    if (!account) throw new Error("Account not found");

    const current = embeddingModelId();
    const stored = account.binaryIndex as unknown;
    let data: string | null = null;
    let model = LEGACY_MODEL;
    if (stored && typeof stored === "object" && (stored as Stored).v === 2) {
      data = (stored as Stored).data;
      model = (stored as Stored).embeddingModel;
    } else if (stored) {
      data = stored as string;
    }

    if (data && model === current) {
      this.orama = await restore("json", data as never);
      return;
    }
    this.stale = !!data; // an index existed, but for another model
    this.orama = await create({ schema: SCHEMA });
    await this.saveIndex();
  }

  /** Inserts into the in-memory index; call `saveIndex()` once after a batch. */
  async insert(document: Record<string, unknown>) {
    await insert(this.orama, document as never);
  }

  async size() {
    return count(this.orama);
  }

  async vectorSearch({ prompt, numResults = 10 }: { prompt: string; numResults?: number }) {
    const embeddings = await getEmbeddings(prompt);
    return search(this.orama, {
      mode: "hybrid",
      term: prompt,
      vector: { value: embeddings, property: "embeddings" },
      // ada-002 cosine scores cluster high; newer models (Gemini, 3-small) lower.
      similarity: embeddingModelId().includes("ada") ? 0.8 : 0.55,
      limit: numResults,
    });
  }

  async search({ term }: { term: string }) {
    return search(this.orama, { term });
  }

  async saveIndex() {
    const data = (await persist(this.orama, "json")) as string;
    const value: Stored = { v: 2, embeddingModel: embeddingModelId(), data };
    await db.account.update({
      where: { id: this.accountId },
      data: { binaryIndex: value as unknown as Prisma.InputJsonValue },
    });
  }

  /**
   * Rebuild the index from stored mail (most recent first), embedding in
   * batches so it stays within free-tier rate limits.
   */
  async rebuild(limit = 300) {
    this.orama = await create({ schema: SCHEMA });
    const emails = await db.email.findMany({
      where: { thread: { accountId: this.accountId } },
      orderBy: { sentAt: "desc" },
      take: limit,
      select: {
        subject: true,
        body: true,
        bodySnippet: true,
        sentAt: true,
        threadId: true,
        from: { select: { name: true, address: true } },
        to: { select: { name: true, address: true } },
      },
    });
    const docs = emails.map((e) => {
      const body = turndown.turndown(e.body ?? e.bodySnippet ?? "");
      const from = `${e.from.name ?? ""} <${e.from.address}>`;
      const to = e.to.map((t) => `${t.name ?? ""} <${t.address}>`);
      return {
        doc: { title: e.subject, body, rawBody: e.bodySnippet ?? "", from, to, sentAt: e.sentAt.toLocaleString(), threadId: e.threadId },
        text: `From: ${from}\nTo: ${to.join(", ")}\nSubject: ${e.subject}\nBody: ${body.slice(0, 4000)}`,
      };
    });
    const vectors = await embedTexts(docs.map((d) => d.text));
    for (const [i, d] of docs.entries()) await this.insert({ ...d.doc, embeddings: vectors[i] });
    await this.saveIndex();
    this.stale = false;
    return docs.length;
  }
}
