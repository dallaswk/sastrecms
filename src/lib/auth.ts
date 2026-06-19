import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import type { Database } from "@db/client";
import * as schema from "@db/schema";

export function createAuth(db: Database, resendApiKey?: string) {
  const key = resendApiKey ?? "";

  return betterAuth({
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
                  from: "sASTRe <noreply@mail.sastrecms.com>",
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
