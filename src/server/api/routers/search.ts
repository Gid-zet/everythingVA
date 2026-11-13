import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { authoriseAccountAccess } from "./mail";
import { OramaManager } from "@/lib/orama";

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

      // Rebuild from scratch (the old version appended duplicates on every run),
      // embedding in batches with the configured provider.
      const indexedCount = await oramaManager.rebuild(500);
      return { success: true, indexedCount };
    }),
});
