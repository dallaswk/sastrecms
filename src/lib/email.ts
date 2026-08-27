/**
 * Sending mail.
 *
 * Resend over `fetch`, not the SDK: the SDK pulls in node builtins that do not exist on
 * Workers. Extracted from auth.ts because a contact form needs the same thing, and having
 * two copies of "how this project sends an email" is how one of them ends up without the
 * error handling.
 */

export type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /**
   * Where a reply goes. For a contact form this is the visitor's own address, which is the
   * single most useful thing about the notification: the client hits Reply and is talking
   * to the lead, instead of copying the address out of the body.
   */
  replyTo?: string;
};

export type EmailConfig = { apiKey?: string; from?: string };

export type EmailResult =
  | { sent: true; id?: string }
  | { sent: false; reason: string };

const DEFAULT_FROM = "sASTRe <noreply@example.com>";

/**
 * Never throws.
 *
 * Every caller is doing something else that already succeeded — a form submission is
 * stored before this runs — and losing the visitor's message because the mail provider
 * was down would be the worse failure. The result is returned so the caller can record
 * that the notification did not go out.
 */
export async function sendEmail(config: EmailConfig, payload: EmailPayload): Promise<EmailResult> {
  if (!config.apiKey) {
    return { sent: false, reason: "No hay clave de Resend configurada" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from || DEFAULT_FROM,
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        subject: payload.subject,
        html: payload.html,
        ...(payload.text ? { text: payload.text } : {}),
        ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
      }),
    });

    if (!response.ok) {
      // Resend's body says which field it rejected — usually an unverified `from` domain,
      // which is the one failure a site owner can actually fix.
      const body = await response.text().catch(() => "");
      return { sent: false, reason: `Resend respondió ${response.status}: ${body.slice(0, 300)}` };
    }

    const data = (await response.json().catch(() => null)) as { id?: string } | null;
    return { sent: true, ...(data?.id ? { id: data.id } : {}) };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Escapes a value before it goes into an HTML email body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
