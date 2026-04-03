import { betterAuth, type BetterAuthOptions } from "better-auth";
import type Database from "better-sqlite3";

/**
 * Auth flow:
 *
 * Browser -> Vite proxy -> Express -> Better Auth -> SQLite
 *   GET /api/auth/get-session -> check sessions table -> return session | null
 *   POST /api/auth/sign-in/social -> redirect to Google/GitHub -> callback -> create user+session
 *   POST /api/auth/sign-up/email -> create user+session -> set cookie
 *   POST /api/auth/sign-in/email -> verify password -> set cookie
 */
export function createAuth(db: Database.Database) {
  const opts = {
    database: db as BetterAuthOptions["database"],
    basePath: "/api/auth",
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      },
      github: {
        clientId: process.env.GITHUB_CLIENT_ID || "",
        clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
        enabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      },
    },
    secret: process.env.BETTER_AUTH_SECRET,
  } satisfies BetterAuthOptions;

  return betterAuth(opts);
}

export type Auth = ReturnType<typeof createAuth>;
