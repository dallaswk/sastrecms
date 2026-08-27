import type { EmailPayload } from "@lib/email";
import { renderBody, renderSubject, type TemplateContext } from "./template";
import type { FormField, SubmissionValues } from "./types";

/**
 * The two emails a submission can produce: the notification to the site owner, and the
 * acknowledgement to the visitor.
 *
 * Pure functions, so the part that decides what a client reads — the subject line they see
 * in their phone's notification, the Reply-To that decides whether hitting Reply reaches the
 * lead — is testable without a mail provider.
 */

export const DEFAULT_NOTIFY_SUBJECT = "Nuevo mensaje desde {{_sitio}}";
export const DEFAULT_NOTIFY_BODY = `Nuevo mensaje desde {{_pagina}} ({{_url}}), el {{_fecha}}.

{{_respuestas}}`;

export const DEFAULT_REPLY_SUBJECT = "Hemos recibido tu mensaje";
export const DEFAULT_REPLY_BODY = `Gracias por escribirnos. Hemos recibido tu mensaje y te respondemos lo antes posible.

Esto es lo que nos has enviado:

{{_respuestas}}

Un saludo,
{{_sitio}}`;

export type NotificationInput = {
  fields: FormField[];
  values: SubmissionValues;
  sender: { name?: string; email?: string };
  siteName: string;
  pageTitle: string;
  pageUrl: string;
  date: string;
  consentText?: string;
  /** One address, or several for a notification that must reach more than one person. */
  to: string | string[];
  /** The owner's own template, or the default above when they have not written one. */
  subjectTemplate?: string;
  bodyTemplate?: string;
};

function contextOf(input: NotificationInput): TemplateContext {
  return {
    fields: input.fields,
    values: input.values,
    siteName: input.siteName,
    pageTitle: input.pageTitle,
    pageUrl: input.pageUrl,
    date: input.date,
  };
}

/** The email to whoever runs the site. */
export function buildNotification(input: NotificationInput): EmailPayload {
  const context = contextOf(input);
  const subject = renderSubject(input.subjectTemplate?.trim() || DEFAULT_NOTIFY_SUBJECT, context);
  const body = renderBody(input.bodyTemplate?.trim() || DEFAULT_NOTIFY_BODY, context);

  return {
    to: input.to,
    // The sender's name is appended rather than templated in, so it is there even when the
    // owner has written their own subject and forgotten to include it.
    subject: input.sender.name && !subject.includes(input.sender.name)
      ? `${subject}: ${input.sender.name}`
      : subject,
    // Reply-To is the visitor, so the client answers by hitting Reply instead of copying an
    // address out of the body.
    ...(input.sender.email ? { replyTo: input.sender.email } : {}),
    html:
      body.html +
      (input.sender.email
        ? `<p style="font-size:13px">Responde a este correo para contestar a ${escapeAttr(input.sender.email)}.</p>`
        : "") +
      (input.consentText
        ? `<p style="color:#666;font-size:12px">Consentimiento aceptado: ${escapeAttr(input.consentText)}</p>`
        : ""),
    text:
      body.text + (input.consentText ? `\n\nConsentimiento aceptado: ${input.consentText}` : ""),
  };
}

export type AutoReplyInput = Omit<NotificationInput, "to"> & {
  /** Always the visitor's own address, never a list. */
  to: string;
  replyToOwner?: string;
};

/**
 * The acknowledgement to the visitor.
 *
 * Only ever sent to an address the visitor typed into an `email` field of this form, which
 * is what keeps it from being a way to mail a stranger: the address is not chosen by
 * whoever crafts the request, it is the one the reply goes to. The rate limit caps the rest.
 */
export function buildAutoReply(input: AutoReplyInput): EmailPayload {
  const context = contextOf(input);
  const body = renderBody(input.bodyTemplate?.trim() || DEFAULT_REPLY_BODY, context);

  return {
    to: input.to,
    subject: renderSubject(input.subjectTemplate?.trim() || DEFAULT_REPLY_SUBJECT, context),
    // So the visitor replying reaches a person, not the no-reply the site sends from.
    ...(input.replyToOwner ? { replyTo: input.replyToOwner } : {}),
    html: body.html,
    text: body.text,
  };
}

/** Local alias so this module does not import escapeHtml under a name that reads wrong. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
