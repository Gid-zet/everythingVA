import pLimit from "p-limit";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { authoriseAccountAccess } from "./mail";
import { OramaManager } from "@/lib/orama";
import { getEmbeddings } from "@/lib/embeddings";
import { db } from "@/server/db";

export const searchRouter = createTRPCRouter({
  search: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        query: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const account = await ctx.db.account.findFirst({
        where: {
          id: input.accountId,
          userId: ctx.auth.id,
        },
        select: {
          id: true,
        },
      });

      if (!account) throw new Error("Invalid token");
      const oramaManager = new OramaManager(account.id);
      await oramaManager.initialize();

      const { query } = input;
      const results = await oramaManager.search({ term: query });
      return results;
    }),

  populateIndex: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const account = await ctx.db.account.findFirst({
        where: {
          id: input.accountId,
          userId: ctx.auth.id,
        },
        select: {
          id: true,
        },
      });

      if (!account) throw new Error("Invalid token");

      const oramaManager = new OramaManager(account.id);
      await oramaManager.initialize();

      // Get emails for this account
      const emails = await db.email.findMany({
        where: {
          thread: { accountId: account.id },
        },
        select: {
          subject: true,
          bodySnippet: true,
          body: true,
          from: { select: { address: true, name: true } },
          to: { select: { address: true, name: true } },
          sentAt: true,
          threadId: true,
        },
        take: 1000, // Increase limit to index more emails
      });

      // Insert emails into Orama index
      console.log(`Indexing ${emails.length} emails for account ${account.id}`);
      const limit = pLimit(8);
      await Promise.all(
        emails.map((email, index) => limit(async () => {
          const bodyEmbedding = await getEmbeddings(email.bodySnippet || "");
          await oramaManager.insert({
            title: email.subject || "",
            body: email.bodySnippet || "",
            rawBody: email.body || "",
            from: `${email.from.name} <${email.from.address}>`,
            to: email.to.map((t) => `${t.name} <${t.address}>`),
            sentAt: email.sentAt.getTime().toString(),
            embeddings: bodyEmbedding,
            threadId: email.threadId,
          });
          if ((index + 1) % 100 === 0) {
            console.log(`Indexed ${index + 1}/${emails.length} emails`);
          }
        })),
      );
      await oramaManager.saveIndex();
      console.log(`Finished indexing ${emails.length} emails`);

      return { success: true, indexedCount: emails.length };
    }),
});
