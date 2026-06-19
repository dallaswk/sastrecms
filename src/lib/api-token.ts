import { eq, and, isNull } from "drizzle-orm";
import { apiTokens } from "@db/schema";
import type { Database } from "@db/client";

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateRawToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function validateApiToken(
  db: Database,
  rawToken: string
): Promise<{ userId: string; tokenId: string } | null> {
  const hash = await hashToken(rawToken);

  const token = await db.query.apiTokens.findFirst({
    where: and(
      eq(apiTokens.tokenHash, hash),
      isNull(apiTokens.revokedAt)
    ),
  });

  if (!token) return null;

  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, token.id));

  return { userId: token.userId, tokenId: token.id };
}
