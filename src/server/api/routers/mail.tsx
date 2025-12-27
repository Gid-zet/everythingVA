import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import Account from "@/lib/account";
import { syncEmailsToDatabase } from "@/lib/sync-to-db";
import { db } from "@/server/db";
import { getEmailDetails } from "@/lib/aurinko";
import type { Prisma } from "@prisma/client";
import { emailAddressSchema } from "@/lib/types";
import { FREE_CREDITS_PER_DAY } from "@/app/constants";
import { EmailOrganizer } from "@/lib/email-organizer";
import { checkAccountAuthStatus } from "@/lib/account-utils";
import { syncEmailOrganizationToProvider } from "@/lib/provider-email-actions";
import { getValidToken } from "@/lib/token-refresh";

export const authoriseAccountAccess = async (
  accountId: string,
  userId: string,
) => {
  try {
    const account = await db.account.findFirst({
      where: {
        id: accountId,
        userId: userId,
      },
      select: {
        id: true,
        emailAddress: true,
        name: true,
        token: true,
      },
    });
    if (!account) {
      console.log(
        `No account found for accountId: ${accountId}, userId: ${userId}`,
      );
      throw new Error(
        "Account not found. Please connect your email account first.",
      );
    }
    return account;
  } catch (error) {
    console.error("Error in authoriseAccountAccess:", error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error("Failed to access account");
  }
};

const inboxFilter = (accountId: string): Prisma.ThreadWhereInput => ({
  accountId,
  inboxStatus: true,
});

const sentFilter = (accountId: string): Prisma.ThreadWhereInput => ({
  accountId,
  sentStatus: true,
});

const draftFilter = (accountId: string): Prisma.ThreadWhereInput => ({
  accountId,
  draftStatus: true,
});

export const mailRouter = createTRPCRouter({
  getAccounts: protectedProcedure.query(async ({ ctx }) => {
    try {
      console.log("getAccounts called with userId:", ctx.auth.id);
      const accounts = await ctx.db.account.findMany({
        where: {
          userId: ctx.auth.id,
        },
        select: {
          id: true,
          emailAddress: true,
          name: true,
        },
      });
      console.log("getAccounts result:", accounts);
      return accounts;
    } catch (error) {
      console.error("Error in getAccounts:", error);
      // Return empty array if there's a database error
      return [];
    }
  }),
  getNumThreads: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        tab: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      let filter: Prisma.ThreadWhereInput = {};
      if (input.tab === "inbox") {
        filter = inboxFilter(account.id);
      } else if (input.tab === "sent") {
        filter = sentFilter(account.id);
      } else if (input.tab === "drafts") {
        filter = draftFilter(account.id);
      }
      return await ctx.db.thread.count({
        where: filter,
      });
    }),
  getThreads: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        tab: z.string(),
        done: z.boolean(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      let filter: Prisma.ThreadWhereInput = {};
      if (input.tab === "inbox") {
        filter = inboxFilter(account.id);
      } else if (input.tab === "sent") {
        filter = sentFilter(account.id);
      } else if (input.tab === "drafts") {
        filter = draftFilter(account.id);
      }

      filter.done = {
        equals: input.done,
      };

      const threads = await ctx.db.thread.findMany({
        where: filter,
        include: {
          emails: {
            orderBy: {
              sentAt: "asc",
            },
            select: {
              from: true,
              body: true,
              bodySnippet: true,
              emailLabel: true,
              subject: true,
              sysLabels: true,
              id: true,
              sentAt: true,
            },
          },
        },
        take: 15,
        orderBy: {
          lastMessageDate: "desc",
        },
      });
      return threads;
    }),

  getThreadById: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        threadId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      return await ctx.db.thread.findUnique({
        where: { id: input.threadId },
        include: {
          emails: {
            orderBy: {
              sentAt: "asc",
            },
            select: {
              from: true,
              body: true,
              subject: true,
              bodySnippet: true,
              emailLabel: true,
              sysLabels: true,
              id: true,
              sentAt: true,
            },
          },
        },
      });
    }),

  getReplyDetails: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        threadId: z.string(),
        replyType: z.enum(["reply", "replyAll"]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      const thread = await ctx.db.thread.findUnique({
        where: { id: input.threadId },
        include: {
          emails: {
            orderBy: { sentAt: "asc" },
            select: {
              from: true,
              to: true,
              cc: true,
              bcc: true,
              sentAt: true,
              subject: true,
              internetMessageId: true,
            },
          },
        },
      });

      if (!thread || thread.emails.length === 0) {
        throw new Error("Thread not found or empty");
      }

      const lastExternalEmail = thread.emails
        .reverse()
        .find((email) => email.from.id !== account.id);

      if (!lastExternalEmail) {
        throw new Error("No external email found in thread");
      }

      const allRecipients = new Set([
        ...thread.emails.flatMap((e) => [e.from, ...e.to, ...e.cc]),
      ]);

      if (input.replyType === "reply") {
        return {
          to: [lastExternalEmail.from],
          cc: [],
          from: { name: account.name, address: account.emailAddress },
          subject: `${lastExternalEmail.subject}`,
          id: lastExternalEmail.internetMessageId,
        };
      } else if (input.replyType === "replyAll") {
        return {
          to: [
            lastExternalEmail.from,
            ...lastExternalEmail.to.filter((addr) => addr.id !== account.id),
          ],
          cc: lastExternalEmail.cc.filter((addr) => addr.id !== account.id),
          from: { name: account.name, address: account.emailAddress },
          subject: `${lastExternalEmail.subject}`,
          id: lastExternalEmail.internetMessageId,
        };
      }
    }),

  syncEmails: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      if (!account) throw new Error("Invalid token");

      try {
        const acc = new Account(account.token, input.accountId);
        await acc.syncEmails();
        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message === "TOKEN_EXPIRED") {
          throw new Error("TOKEN_EXPIRED");
        }
        console.error("Sync emails error:", error);
        throw new Error("Failed to sync emails");
      }
    }),
  checkAccountAuth: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await checkAccountAuthStatus(input.accountId);
    }),
  setUndone: protectedProcedure
    .input(
      z.object({
        threadId: z.string().optional(),
        threadIds: z.array(z.string()).optional(),
        accountId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      if (!account) throw new Error("Invalid token");
      if (input.threadId) {
        await ctx.db.thread.update({
          where: {
            id: input.threadId,
          },
          data: {
            done: false,
          },
        });
      }
      if (input.threadIds) {
        await ctx.db.thread.updateMany({
          where: {
            id: {
              in: input.threadIds,
            },
          },
          data: {
            done: false,
          },
        });
      }
    }),
  setDone: protectedProcedure
    .input(
      z.object({
        threadId: z.string().optional(),
        threadIds: z.array(z.string()).optional(),
        accountId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.threadId && !input.threadIds)
        throw new Error("No threadId or threadIds provided");
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      if (!account) throw new Error("Invalid token");
      if (input.threadId) {
        await ctx.db.thread.update({
          where: {
            id: input.threadId,
          },
          data: {
            done: true,
          },
        });
      }
      if (input.threadIds) {
        await ctx.db.thread.updateMany({
          where: {
            id: {
              in: input.threadIds,
            },
          },
          data: {
            done: true,
          },
        });
      }
    }),
  getEmailDetails: protectedProcedure
    .input(
      z.object({
        emailId: z.string(),
        accountId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      return await getEmailDetails(account.token, input.emailId);
    }),
  sendEmail: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        body: z.string(),
        subject: z.string(),
        from: emailAddressSchema,
        to: z.array(emailAddressSchema),
        cc: z.array(emailAddressSchema).optional(),
        bcc: z.array(emailAddressSchema).optional(),
        replyTo: emailAddressSchema,
        inReplyTo: z.string().optional(),
        threadId: z.string().optional(),
        attachments: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              size: z.number(),
              type: z.string(),
              content: z.string(), // base64 encoded content
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const acc = await authoriseAccountAccess(input.accountId, ctx.auth.id);
      const account = new Account(acc.token);
      console.log("sendmail", input);
      await account.sendEmail({
        body: input.body,
        subject: input.subject,
        threadId: input.threadId,
        to: input.to,
        bcc: input.bcc,
        cc: input.cc,
        replyTo: input.replyTo,
        from: input.from,
        inReplyTo: input.inReplyTo,
        attachments: input.attachments,
      });
    }),
  getEmailSuggestions: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        query: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      return await ctx.db.emailAddress.findMany({
        where: {
          accountId: input.accountId,
          OR: [
            {
              address: {
                contains: input.query,
                mode: "insensitive",
              },
            },
            {
              name: {
                contains: input.query,
                mode: "insensitive",
              },
            },
          ],
        },
        select: {
          address: true,
          name: true,
        },
        take: 10,
      });
    }),
  getMyAccount: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );
      return account;
    }),
  getChatbotInteraction: protectedProcedure.query(async ({ ctx }) => {
    const chatbotInteraction = await ctx.db.chatbotInteraction.findUnique({
      where: {
        day: new Date().toDateString(),
        userId: ctx.auth.id,
      },
      select: { count: true },
    });
    const remainingCredits =
      FREE_CREDITS_PER_DAY - (chatbotInteraction?.count || 0);
    return {
      remainingCredits,
    };
  }),

  // Email Organization Endpoints
  organizeEmails: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        autoClassify: z.boolean().optional(),
        createCategories: z.boolean().optional(),
        applyRules: z.boolean().optional(),
        reorganize: z.boolean().optional(), // If true, re-organize all emails including already classified ones
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      return await EmailOrganizer.organizeEmails({
        userId: ctx.auth.id,
        accountId: account.id,
        autoClassify: input.autoClassify,
        createCategories: input.createCategories,
        applyRules: input.applyRules,
        reorganize: input.reorganize,
      });
    }),

  getOrganizedEmails: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        category: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        status: z
          .enum(["unread", "read", "archived", "flagged", "snoozed"])
          .optional(),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      return await EmailOrganizer.getOrganizedEmails(ctx.auth.id, account.id, {
        category: input.category,
        priority: input.priority,
        status: input.status,
        search: input.search,
      });
    }),

  getEmailCategories: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      return await ctx.db.emailCategory.findMany({
        where: {
          userId: ctx.auth.id,
        },
        orderBy: {
          name: "asc",
        },
      });
    }),

  getEmailStats: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      return await EmailOrganizer.getEmailStats(ctx.auth.id, account.id);
    }),

  createEmailRule: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        name: z.string(),
        description: z.string().optional(),
        conditions: z.array(
          z.object({
            field: z.string(),
            operator: z.string(),
            value: z.any(),
          }),
        ),
        actions: z.array(
          z.object({
            type: z.string(),
            value: z.any(),
          }),
        ),
        priority: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      return await ctx.db.emailRule.create({
        data: {
          userId: ctx.auth.id,
          name: input.name,
          description: input.description,
          conditions: input.conditions,
          actions: input.actions,
          priority: input.priority || 0,
        },
      });
    }),

  getEmailRules: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      return await ctx.db.emailRule.findMany({
        where: {
          userId: ctx.auth.id,
        },
        orderBy: {
          priority: "desc",
        },
      });
    }),

  updateEmailOrganization: protectedProcedure
    .input(
      z.object({
        emailId: z.string(),
        accountId: z.string(),
        categoryId: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        status: z
          .enum(["unread", "read", "archived", "flagged", "snoozed"])
          .optional(),
        customLabels: z.array(z.string()).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      // Verify the email belongs to this account
      const email = await ctx.db.email.findFirst({
        where: {
          id: input.emailId,
          thread: {
            accountId: account.id,
          },
        },
      });

      if (!email) {
        throw new Error("Email not found or access denied");
      }

      // Update the email
      const updateData: any = {};

      if (input.categoryId !== undefined) {
        updateData.categoryId = input.categoryId || null;
      }

      if (input.priority !== undefined) {
        updateData.priority = input.priority;
      }

      if (input.status !== undefined) {
        updateData.status = input.status;
      }

      if (input.customLabels !== undefined) {
        updateData.customLabels = input.customLabels;
      }

      // Update or create email notes
      if (input.notes !== undefined) {
        // You might want to create a separate EmailNotes table for this
        // For now, we'll store it in a custom field or use the existing structure
        updateData.notes = input.notes;
      }

      const updatedEmail = await ctx.db.email.update({
        where: { id: input.emailId },
        data: updateData,
      });

      if (input.status !== undefined || input.customLabels !== undefined) {
        try {
          await syncEmailOrganizationToProvider({
            accountId: account.id,
            emailProviderId: email.id,
            status: input.status ?? null,
            customLabels: input.customLabels,
          });
        } catch (error) {
          console.error("Failed to sync provider organization:", error);
        }
      }

      return updatedEmail;
    }),

  bulkUpdateEmails: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
        emailIds: z.array(z.string()),
        categoryId: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        status: z
          .enum(["unread", "read", "archived", "flagged", "snoozed"])
          .optional(),
        customLabels: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      // Verify all emails belong to this account
      const emails = await ctx.db.email.findMany({
        where: {
          id: { in: input.emailIds },
          thread: {
            accountId: account.id,
          },
        },
      });

      if (emails.length !== input.emailIds.length) {
        throw new Error("Some emails not found or access denied");
      }

      // Prepare update data
      const updateData: any = {};

      if (input.categoryId !== undefined) {
        updateData.categoryId = input.categoryId || null;
      }

      if (input.priority !== undefined) {
        updateData.priority = input.priority;
      }

      if (input.status !== undefined) {
        updateData.status = input.status;
      }

      if (input.customLabels !== undefined) {
        updateData.customLabels = input.customLabels;
      }

      // Bulk update emails
      const result = await ctx.db.email.updateMany({
        where: {
          id: { in: input.emailIds },
          thread: {
            accountId: account.id,
          },
        },
        data: updateData,
      });

      if (input.status !== undefined || input.customLabels !== undefined) {
        await Promise.all(
          emails.map((email) =>
            syncEmailOrganizationToProvider({
              accountId: account.id,
              emailProviderId: email.id,
              status: input.status ?? null,
              customLabels: input.customLabels,
            }).catch((error) =>
              console.error(
                `Failed to sync provider organization for email ${email.id}:`,
                error,
              ),
            ),
          ),
        );
      }

      return { updatedCount: result.count };
    }),

  pushCategoriesToEmailProvider: protectedProcedure
    .input(
      z.object({
        accountId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await authoriseAccountAccess(
        input.accountId,
        ctx.auth.id,
      );

      // Check if account has a valid token before processing
      const hasValidToken = await getValidToken(account.id);
      
      if (!hasValidToken) {
        // Check if account has a refresh token at all
        const accountWithToken = await ctx.db.account.findUnique({
          where: { id: account.id },
          select: { refreshToken: true },
        });
        
        if (!accountWithToken?.refreshToken) {
          return {
            success: false,
            processedCount: 0,
            successCount: 0,
            errorCount: 0,
            errors: ["Account needs re-authorization. Please re-authorize your email account before pushing categories."],
            needsReauth: true,
            needsResync: false,
          };
        }
      }

      // Step 1: Get ALL categories for this user (not just those with emails)
      const allCategories = await ctx.db.emailCategory.findMany({
        where: {
          userId: ctx.auth.id,
        },
        orderBy: {
          name: "asc",
        },
      });

      if (allCategories.length === 0) {
        return {
          success: true,
          processedCount: 0,
          successCount: 0,
          errorCount: 0,
          errors: undefined,
          needsReauth: false,
        };
      }

      // Step 2: Get any email from this account to use for label creation
      // (Labels are created when assigned to emails, so we need at least one email)
      // Try to find a recent email that's likely to still exist in the provider
      const anyEmail = await ctx.db.email.findFirst({
        where: {
          thread: {
            accountId: account.id,
          },
        },
        orderBy: {
          receivedAt: "desc",
        },
      });
      
      // Track if we're getting too many 404s (indicates emails need re-syncing)
      let emailNotFoundCount = 0;
      const maxNotFoundBeforeWarning = 5;

      // Step 3: Get all emails with categories for this account, grouped by category
      const categorizedEmails = await ctx.db.email.findMany({
        where: {
          thread: {
            accountId: account.id,
          },
          categoryId: {
            not: null,
          },
        },
        include: {
          category: true,
        },
      });

      // Group emails by category for better organization
      const emailsByCategory = new Map<string, typeof categorizedEmails>();
      for (const email of categorizedEmails) {
        if (!email.category) continue;
        const categoryName = email.category.name;
        if (!emailsByCategory.has(categoryName)) {
          emailsByCategory.set(categoryName, []);
        }
        emailsByCategory.get(categoryName)!.push(email);
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      let hasAuthError = false;
      const createdLabels = new Set<string>();
      let labelsCreatedCount = 0;

      // Step 4: Create labels in provider for ALL categories
      // (Labels are automatically created in Gmail/Office365 when assigned to emails)
      if (anyEmail) {
        for (const category of allCategories) {
          if (createdLabels.has(category.name)) continue;

          try {
            // Use any email to create the label (labels are created when first assigned)
            const existingLabels = anyEmail.keywords || [];
            const labelsToPush = existingLabels.includes(category.name)
              ? existingLabels
              : [...existingLabels, category.name];
            
            await syncEmailOrganizationToProvider({
              accountId: account.id,
              emailProviderId: anyEmail.id,
              customLabels: labelsToPush,
            });
            
            // Update database for the email used to create the label
            await ctx.db.email.update({
              where: { id: anyEmail.id },
              data: {
                keywords: labelsToPush,
                customLabels: labelsToPush,
              },
            });
            
            createdLabels.add(category.name);
            labelsCreatedCount++;
            console.log(`Created label "${category.name}" in email provider`);
          } catch (createError: any) {
            if (createError instanceof Error && createError.message.includes("No valid provider token")) {
              hasAuthError = true;
              break; // Stop processing if auth fails
            } else if (
              createError?.response?.status === 404 ||
              (createError instanceof Error && createError.message.includes("Email not found in provider"))
            ) {
              emailNotFoundCount++;
              console.log(`Email ${anyEmail.id} not found in provider, skipping label creation for "${category.name}"`);
              
              // If we're getting too many 404s, emails likely need re-syncing
              if (emailNotFoundCount >= maxNotFoundBeforeWarning) {
                // Try to find a valid email by fetching recent emails from provider
                // For now, just skip and add a warning
                if (emailNotFoundCount === maxNotFoundBeforeWarning) {
                  errors.push(`Many emails not found in provider. This usually happens after re-authorization. Please sync your emails first to update email IDs.`);
                }
                // Skip remaining label creation attempts
                continue;
              }
              
              // Try to find another email to use for this label
              const alternativeEmail = await ctx.db.email.findFirst({
                where: {
                  thread: {
                    accountId: account.id,
                  },
                  id: {
                    not: anyEmail.id,
                  },
                },
                orderBy: {
                  receivedAt: "desc",
                },
              });
              
              if (alternativeEmail) {
                try {
                  const altLabels = alternativeEmail.keywords || [];
                  const altLabelsToPush = altLabels.includes(category.name)
                    ? altLabels
                    : [...altLabels, category.name];
                  
                  await syncEmailOrganizationToProvider({
                    accountId: account.id,
                    emailProviderId: alternativeEmail.id,
                    customLabels: altLabelsToPush,
                  });
                  
                  await ctx.db.email.update({
                    where: { id: alternativeEmail.id },
                    data: {
                      keywords: altLabelsToPush,
                      customLabels: altLabelsToPush,
                    },
                  });
                  
                  createdLabels.add(category.name);
                  labelsCreatedCount++;
                  console.log(`Created label "${category.name}" in email provider using alternative email`);
                } catch (altError: any) {
                  emailNotFoundCount++;
                  if (altError?.response?.status === 404 || 
                      (altError instanceof Error && altError.message.includes("Email not found in provider"))) {
                    // Another 404, continue to next category
                    continue;
                  }
                  const errorMessage = `Failed to create label "${category.name}": ${altError instanceof Error ? altError.message : "Unknown error"}`;
                  errors.push(errorMessage);
                  errorCount++;
                }
              } else {
                const errorMessage = `Failed to create label "${category.name}": No emails available to create label`;
                errors.push(errorMessage);
                errorCount++;
              }
            } else {
              const errorMessage = `Failed to create label "${category.name}": ${createError instanceof Error ? createError.message : "Unknown error"}`;
              errors.push(errorMessage);
              errorCount++;
            }
          }
        }
      } else {
        // No emails in account, can't create labels
        return {
          success: false,
          processedCount: 0,
          successCount: 0,
          errorCount: allCategories.length,
          errors: ["Cannot create labels: No emails found in account. Please sync emails first."],
          needsReauth: false,
          needsResync: false,
        };
      }

      // Step 5: Assign all categorized emails to their corresponding labels
      for (const category of allCategories) {
        const categoryEmails = emailsByCategory.get(category.name) || [];
        
        if (categoryEmails.length === 0) {
          // No emails in this category, but label is already created
          continue;
        }

        // Assign all emails in this category to the label
        // Process emails in batches to avoid overwhelming the API
        const batchSize = 10;
        for (let i = 0; i < categoryEmails.length; i += batchSize) {
          const batch = categoryEmails.slice(i, i + batchSize);
          
          await Promise.all(
            batch.map(async (email) => {
              try {
                // Get existing labels and add category name if not already present
                const existingLabels = email.keywords || [];
                const categoryLabel = category.name;
                
                // Only add if not already present
                if (!existingLabels.includes(categoryLabel)) {
                  const updatedLabels = [...existingLabels, categoryLabel];
                  
                  // Update the email in database with new labels
                  await ctx.db.email.update({
                    where: { id: email.id },
                    data: {
                      keywords: updatedLabels,
                      customLabels: updatedLabels,
                    },
                  });

                  // Push to email provider
                  try {
                    await syncEmailOrganizationToProvider({
                      accountId: account.id,
                      emailProviderId: email.id,
                      customLabels: updatedLabels,
                    });
                    successCount++;
                  } catch (syncError: any) {
                    // If it's an auth error, mark it but don't log every single one
                    if (syncError instanceof Error && syncError.message.includes("No valid provider token")) {
                      hasAuthError = true;
                    } else if (
                      syncError?.response?.status === 404 ||
                      (syncError instanceof Error && syncError.message.includes("Email not found in provider"))
                    ) {
                      // Email not found in provider (might have been deleted or ID changed)
                      // This often happens after re-authorization when email IDs change
                      emailNotFoundCount++;
                      
                      // If we're getting too many 404s, add a warning
                      if (emailNotFoundCount === maxNotFoundBeforeWarning) {
                        errors.push(`Many emails not found in provider. This usually happens after re-authorization. Please sync your emails first to update email IDs.`);
                      }
                      
                      console.log(`Email ${email.id} not found in provider, skipping label push (already updated in database)`);
                      // Don't add to errors array or increment errorCount for individual emails
                    } else {
                      const errorMessage = `Failed to push label "${categoryLabel}" to email ${email.id}: ${syncError instanceof Error ? syncError.message : "Unknown error"}`;
                      errors.push(errorMessage);
                      errorCount++;
                    }
                  }
                } else {
                  // Label already exists, just verify it's in the provider
                  try {
                    await syncEmailOrganizationToProvider({
                      accountId: account.id,
                      emailProviderId: email.id,
                      customLabels: existingLabels,
                    });
                    successCount++;
                  } catch (syncError: any) {
                    if (
                      syncError?.response?.status === 404 ||
                      (syncError instanceof Error && syncError.message.includes("Email not found in provider"))
                    ) {
                      emailNotFoundCount++;
                      // If we're getting too many 404s, add a warning
                      if (emailNotFoundCount === maxNotFoundBeforeWarning) {
                        errors.push(`Many emails not found in provider. This usually happens after re-authorization. Please sync your emails first to update email IDs.`);
                      }
                      console.log(`Email ${email.id} not found in provider, skipping verification`);
                    }
                    // Don't count as error for already-labeled emails
                  }
                }
              } catch (error) {
                errorCount++;
                const errorMessage = `Failed to process email ${email.id} in category "${category.name}": ${error instanceof Error ? error.message : "Unknown error"}`;
                errors.push(errorMessage);
              }
            }),
          );
          
          // If we encountered auth errors, stop processing to avoid spam
          if (hasAuthError) {
            break;
          }
        }
        
        if (hasAuthError) {
          break;
        }
      }

      // If we had auth errors, add a summary message instead of listing all errors
      if (hasAuthError) {
        return {
          success: false,
          processedCount: categorizedEmails.length,
          successCount,
          errorCount: categorizedEmails.length - successCount,
          errors: [
            `Unable to push categories to email provider: Account needs re-authorization. Please re-authorize your email account and try again. ${labelsCreatedCount > 0 ? `${labelsCreatedCount} label${labelsCreatedCount !== 1 ? "s" : ""} created. ` : ""}${successCount > 0 ? `${successCount} email${successCount !== 1 ? "s" : ""} updated.` : ""}`.trim(),
            ...errors.slice(0, 5), // Include up to 5 non-auth errors if any
          ],
          needsReauth: true,
          needsResync: false,
        };
      }

      // If we got many 404s, suggest re-syncing emails
      if (emailNotFoundCount >= maxNotFoundBeforeWarning) {
        return {
          success: false,
          processedCount: categorizedEmails.length,
          successCount,
          errorCount: categorizedEmails.length - successCount,
          labelsCreated: labelsCreatedCount,
          errors: [
            `Unable to push categories: ${emailNotFoundCount} email${emailNotFoundCount !== 1 ? "s" : ""} not found in provider. This usually happens after re-authorization when email IDs change. Please sync your emails first to update email IDs, then try pushing categories again.`,
            ...errors.filter(e => !e.includes("Many emails not found")).slice(0, 5),
          ],
          needsReauth: false,
          needsResync: true,
        };
      }

      return {
        success: errorCount === 0,
        processedCount: categorizedEmails.length,
        successCount,
        errorCount,
        labelsCreated: labelsCreatedCount,
        errors: errors.length > 0 ? errors.slice(0, 20) : undefined, // Limit error output
        needsReauth: false,
        needsResync: false,
      };
    }),
});
