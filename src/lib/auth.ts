import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import type { Database } from "@db/client";
import * as schema from "@db/schema";

/**
 * `secret` and `baseURL` are passed in rather than left to Better Auth's process.env
 * fallback: on Cloudflare Workers process.env isn't populated from bindings below
 * compat date 2025-04-01, so the fallback silently finds nothing in production and
 * sessions stop surviving deploys.
 */
export function createAuth(
  db: Database,
  resendApiKey?: string,
  emailFrom?: string,
  // Optional in the type only because it follows optional parameters; the guard below
  // makes the secret mandatory at runtime for every caller.
  options?: { secret?: string; baseURL?: string }
) {
  // Better Auth falls back to process.env.BETTER_AUTH_SECRET when no secret is passed,
  // and on Workers process.env isn't populated from bindings below compat date
  // 2025-04-01. That fallback failing is silent: sessions get signed with whatever it
  // derives, and stop validating after a redeploy. Fail here instead, where the message
  // says what is missing.
  if (!options?.secret) {
    throw new Error(
      "BETTER_AUTH_SECRET no está configurado. Sin él las sesiones no sobreviven a un " +
        "redespliegue. Genera uno con `openssl rand -base64 32` y añádelo al entorno."
    );
  }

  const key = resendApiKey ?? "";
  const from = emailFrom || "sASTRe <noreply@example.com>";

  return betterAuth({
    secret: options.secret,
    ...(options?.baseURL ? { baseURL: options.baseURL } : {}),
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {},
    plugins: key
      ? [
          magicLink({
            sendMagicLink: async ({ email, url }) => {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${key}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  from,
                  to: email,
                  subject: "Accede a sASTRe",
                  html: `<p>Haz clic en el enlace para acceder al panel:<br/><a href="${url}">${url}</a></p><p>El enlace expira en 10 minutos.</p>`,
                }),
              });
            },
          }),
        ]
      : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
