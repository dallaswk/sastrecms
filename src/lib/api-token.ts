import { eq, and, isNull } from "drizzle-orm";
import { apiTokens, users } from "@db/schema";
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
  rawToken: string,
  /**
   * The site the request resolved to.
   *
   * A token is now issued for one site and only works there. It never leaked without this —
   * `requireSiteRole` stopped a token whose owner had no role on the site being addressed — but
   * an operator could not hand a client a credential limited to their own site, which is the
   * first thing anybody paying for one asks for.
   *
   * Optional so a script that has no site context still works; when given, it is enforced.
   */
  siteId?: string
): Promise<{ userId: string; tokenId: string; siteId: string } | null> {
  const hash = await hashToken(rawToken);

  const token = await db.query.apiTokens.findFirst({
    where: and(
      eq(apiTokens.tokenHash, hash),
      isNull(apiTokens.revokedAt)
    ),
  });

  if (!token) return null;

  // Checked before the owner lookup: a token for another site should not even confirm that its
  // owner exists.
  if (siteId && token.siteId !== siteId) return null;

  // A token carries its owner's permissions, so deactivating the owner has to
  // invalidate it too — otherwise the MCP surface stays open to someone who can no
  // longer sign in.
  const owner = await db.query.users.findFirst({
    where: eq(users.id, token.userId),
    columns: { disabled: true },
  });
  if (!owner || owner.disabled) return null;

  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, token.id));

  return { userId: token.userId, tokenId: token.id, siteId: token.siteId };
}
