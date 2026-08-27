import { escapeHtml, type EmailPayload } from "@lib/email";
import type { FormField, SubmissionValues } from "./types";

export type NotificationInput = {
  fields: FormField[];
  values: SubmissionValues;
  sender: { name?: string; email?: string };
  siteName: string;
  pageTitle: string;
  pageUrl: string;
  consentText?: string;
  to: string;
};

/**
 * The notification email.
 *
 * Built as a pure function so the part that decides what a client reads — the subject line
 * they see in their phone's notification, the Reply-To that decides whether hitting Reply
 * reaches the lead — is testable without a mail provider.
 *
 * Everything from the visitor is escaped: this is the one place a stranger's text ends up
 * in HTML that someone else opens.
 */
export function buildNotification(input: NotificationInput): EmailPayload {
  const rows = input.fields
    .filter((field) => input.values[field.key])
    .map(
      (field) =>
        `<tr>` +
        `<th align="left" style="padding:4px 16px 4px 0;vertical-align:top;white-space:nowrap">${escapeHtml(field.label)}</th>` +
        `<td style="padding:4px 0">${escapeHtml(input.values[field.key]).replace(/\n/g, "<br/>")}</td>` +
        `</tr>`
    )
    .join("");

  const lines = input.fields
    .filter((field) => input.values[field.key])
    .map((field) => `${field.label}: ${input.values[field.key]}`)
    .join("\n");

  return {
    to: input.to,
    // The sender's name in the subject is what makes the phone notification useful.
    subject: `Nuevo mensaje desde ${input.siteName}${input.sender.name ? `: ${input.sender.name}` : ""}`,
    // Reply-To is the visitor, so the client answers by hitting Reply instead of copying
    // an address out of the body.
    ...(input.sender.email ? { replyTo: input.sender.email } : {}),
    html:
      `<p>Nuevo mensaje desde <a href="${escapeHtml(input.pageUrl)}">${escapeHtml(input.pageTitle)}</a>.</p>` +
      `<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows}</table>` +
      (input.sender.email
        ? `<p style="font-size:13px">Responde a este correo para contestar a ${escapeHtml(input.sender.email)}.</p>`
        : "") +
      (input.consentText
        ? `<p style="color:#666;font-size:12px">Consentimiento aceptado: ${escapeHtml(input.consentText)}</p>`
        : ""),
    text:
      `Nuevo mensaje desde ${input.pageTitle} (${input.pageUrl})\n\n${lines}` +
      (input.consentText ? `\n\nConsentimiento aceptado: ${input.consentText}` : ""),
  };
}
