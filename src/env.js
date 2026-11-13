import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    KINDE_CLIENT_ID: z.string().min(1),
    KINDE_CLIENT_SECRET: z.string().min(1),
    KINDE_ISSUER_URL: z.string().url(),
    KINDE_SITE_URL: z.string().url(),
    KINDE_POST_LOGOUT_REDIRECT_URL: z.string().url(),
    KINDE_POST_LOGIN_REDIRECT_URL: z.string().url(),
    AURINKO_CLIENT_ID: z.string().min(1),
    AURINKO_CLIENT_SECRET: z.string().min(1),
    AURINKO_SIGNING_SECRET: z.string().min(1),
    // 32 bytes (base64 or hex) used to encrypt provider tokens at rest.
    TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),
    // HMAC key for the OAuth `state` parameter (falls back to TOKEN_ENCRYPTION_KEY).
    OAUTH_STATE_SECRET: z.string().min(16).optional(),
    // Public URL Aurinko can reach for webhooks (e.g. a tunnel in development).
    AURINKO_WEBHOOK_BASE_URL: z.string().url().optional(),
    INITIAL_SYNC_DAYS: z.coerce.number().int().min(1).max(365).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    // AI provider (see src/server/ai/provider.ts)
    AI_PROVIDER: z.enum(["openai", "gemini", "custom"]).optional(),
    AI_API_KEY: z.string().min(1).optional(),
    AI_BASE_URL: z.string().url().optional(),
    AI_MODEL: z.string().min(1).optional(),
    AI_FAST_MODEL: z.string().min(1).optional(),
    GEMINI_API_KEY: z.string().min(1).optional(),
    EMBEDDING_PROVIDER: z.enum(["openai", "gemini", "custom"]).optional(),
    EMBEDDING_MODEL: z.string().min(1).optional(),
    EMBEDDING_API_KEY: z.string().min(1).optional(),
    EMBEDDING_BASE_URL: z.string().url().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_KINDE_CLIENT_ID: z.string().min(1),
    NEXT_PUBLIC_KINDE_ISSUER_URL: z.string().url(),
    NEXT_PUBLIC_KINDE_SITE_URL: z.string().url(),
    NEXT_PUBLIC_URL: z.string().url().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    KINDE_CLIENT_ID: process.env.KINDE_CLIENT_ID,
    KINDE_CLIENT_SECRET: process.env.KINDE_CLIENT_SECRET,
    KINDE_ISSUER_URL: process.env.KINDE_ISSUER_URL,
    KINDE_SITE_URL: process.env.KINDE_SITE_URL,
    KINDE_POST_LOGOUT_REDIRECT_URL: process.env.KINDE_POST_LOGOUT_REDIRECT_URL,
    KINDE_POST_LOGIN_REDIRECT_URL: process.env.KINDE_POST_LOGIN_REDIRECT_URL,
    AURINKO_CLIENT_ID: process.env.AURINKO_CLIENT_ID,
    AURINKO_CLIENT_SECRET: process.env.AURINKO_CLIENT_SECRET,
    AURINKO_SIGNING_SECRET: process.env.AURINKO_SIGNING_SECRET,
    TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
    OAUTH_STATE_SECRET: process.env.OAUTH_STATE_SECRET,
    AURINKO_WEBHOOK_BASE_URL: process.env.AURINKO_WEBHOOK_BASE_URL,
    INITIAL_SYNC_DAYS: process.env.INITIAL_SYNC_DAYS,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_MODEL: process.env.AI_MODEL,
    AI_FAST_MODEL: process.env.AI_FAST_MODEL,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER,
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL,
    EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY,
    EMBEDDING_BASE_URL: process.env.EMBEDDING_BASE_URL,
    NEXT_PUBLIC_KINDE_CLIENT_ID: process.env.NEXT_PUBLIC_KINDE_CLIENT_ID,
    NEXT_PUBLIC_KINDE_ISSUER_URL: process.env.NEXT_PUBLIC_KINDE_ISSUER_URL,
    NEXT_PUBLIC_KINDE_SITE_URL: process.env.NEXT_PUBLIC_KINDE_SITE_URL,
    NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
