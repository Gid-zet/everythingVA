/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { db } from "@/server/db";
import { getKindeUserForAPI } from "@/lib/kinde";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
const ensuredAt = new Map<string, number>();
function recentlyEnsured(userId: string) {
  const t = ensuredAt.get(userId);
  if (t && Date.now() - t < 10 * 60 * 1000) return true;
  if (ensuredAt.size > 5000) ensuredAt.clear();
  return false;
}

export const createTRPCContext = async (opts: { headers: Headers }) => {
  try {
    const user = await getKindeUserForAPI();
    if (process.env.NODE_ENV === "development") {
      console.log("tRPC context user:", user ? { id: user.id, email: user.email } : "null");
    }

    // Make sure the signed-in user has a row, but not on every request: each
    // tRPC call used to run an upsert. Once per user per 10 minutes per
    // server instance is enough to pick up profile changes.
    if (user?.id && user?.email && !recentlyEnsured(user.id)) {
      try {
        await db.user.upsert({
          where: { emailAddress: user.email },
          update: {
            id: user.id,
            firstName:
              (user as any).given_name || (user as any).first_name || "",
            lastName:
              (user as any).family_name || (user as any).last_name || "",
            imageUrl: user.picture || "",
          },
          create: {
            id: user.id,
            emailAddress: user.email,
            firstName:
              (user as any).given_name || (user as any).first_name || "",
            lastName:
              (user as any).family_name || (user as any).last_name || "",
            imageUrl: user.picture || "",
          },
        });
        ensuredAt.set(user.id, Date.now());
      } catch (dbError) {
        console.error("Error ensuring user in database:", dbError);
        // Don't fail the request if database operation fails
      }
    }

    return {
      auth: user,
      db,
      ...opts,
    };
  } catch (error) {
    console.error("Error getting user in tRPC context:", error);
    return {
      auth: null,
      db,
      ...opts,
    };
  }
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    // artificial delay in dev
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});

const isAuth = t.middleware(({ next, ctx, path }) => {
  if (!ctx.auth?.id) {
    if (process.env.NODE_ENV === "development") {
      console.error(`[TRPC] Unauthorized access attempt to ${path}`);
    }
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    });
  }
  return next({
    ctx: { ...ctx, auth: ctx.auth! as Required<typeof ctx.auth> },
  });
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);
export const protectedProcedure = t.procedure.use(timingMiddleware).use(isAuth);
