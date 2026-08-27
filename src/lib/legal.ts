import { cookieTable, type CookieRow } from "./consent";
import type { AnalyticsIds } from "./analytics";

/**
 * Generated legal pages.
 *
 * A pyme site cannot be delivered without a legal notice, a privacy policy and a cookie
 * policy, and the three are the same documents every time with a handful of fields swapped —
 * except the cookie table, which is the part that has to match what the site actually loads
 * and is therefore the part nobody ever keeps up to date. That table is derived.
 *
 * These are templates, not legal advice. The renderer says so on the page, and it should.
 */

export const LEGAL_DOCUMENTS = ["aviso-legal", "privacidad", "cookies"] as const;
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

export const LEGAL_LABELS: Record<LegalDocument, string> = {
  "aviso-legal": "Aviso legal",
  privacidad: "Política de privacidad",
  cookies: "Política de cookies",
};

/** What the documents are generated from. */
export type BusinessInfo = {
  legalName?: string;
  tradeName?: string;
  taxId?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  province?: string;
  country?: string;
  email?: string;
  phone?: string;
  /** Registro Mercantil, or the professional body for a regulated activity. */
  registry?: string;
  /** Only if one has been appointed. */
  dpoEmail?: string;
  /** Who hosts the site, which the legal notice has to state. */
  hosting?: string;
};

export const BUSINESS_FIELDS: { key: keyof BusinessInfo; label: string; hint?: string; required?: boolean }[] = [
  { key: "legalName", label: "Denominación social o nombre completo", required: true },
  { key: "tradeName", label: "Nombre comercial", hint: "Si es distinto del anterior" },
  { key: "taxId", label: "NIF / CIF", required: true },
  { key: "address", label: "Domicilio", required: true },
  { key: "postalCode", label: "Código postal", required: true },
  { key: "city", label: "Población", required: true },
  { key: "province", label: "Provincia" },
  { key: "country", label: "País" },
  { key: "email", label: "Correo de contacto", required: true },
  { key: "phone", label: "Teléfono" },
  { key: "registry", label: "Registro Mercantil o colegio profesional", hint: "Tomo, folio, hoja; o número de colegiado" },
  { key: "dpoEmail", label: "Correo del delegado de protección de datos", hint: "Sólo si lo hay" },
  { key: "hosting", label: "Proveedor de alojamiento", hint: "Por defecto, Cloudflare" },
];

/** Which required fields are missing, so the backoffice can say so instead of shipping gaps. */
export function missingBusinessFields(business: BusinessInfo | null | undefined): string[] {
  const info = business ?? {};
  return BUSINESS_FIELDS.filter((f) => f.required && !info[f.key]?.trim()).map((f) => f.label);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A placeholder for a field the owner has not filled in.
 *
 * Visible on purpose: a legal notice that silently omits the tax id looks finished and is
 * not, and the whole point of generating these is that the gap is obvious before launch.
 */
function value(raw: string | undefined, label: string): string {
  const text = raw?.trim();
  return text
    ? escapeHtml(text)
    : `<mark style="background:#fde68a;color:#111">[falta: ${escapeHtml(label)}]</mark>`;
}

function fullAddress(b: BusinessInfo): string {
  const parts = [b.address, [b.postalCode, b.city].filter(Boolean).join(" "), b.province, b.country]
    .map((p) => p?.trim())
    .filter(Boolean);
  return parts.length ? escapeHtml(parts.join(", ")) : value(undefined, "domicilio");
}

export type LegalContext = {
  business: BusinessInfo;
  siteName: string;
  /** The site's own domain, as shown to the visitor. */
  domain: string;
  analytics: AnalyticsIds;
  /** Where the cookie policy lives, for cross-links. */
  cookiesPath?: string;
  privacyPath?: string;
};

export type LegalSection = { heading: string; html: string };

function cookieTableHtml(rows: CookieRow[]): string {
  const body = rows
    .map(
      (row) =>
        `<tr><td><code>${escapeHtml(row.name)}</code></td><td>${escapeHtml(row.provider)}</td>` +
        `<td>${escapeHtml(row.purpose)}</td><td>${escapeHtml(row.retention)}</td>` +
        `<td>${escapeHtml(row.category)}</td></tr>`
    )
    .join("");
  return (
    `<table><thead><tr><th>Cookie</th><th>Proveedor</th><th>Finalidad</th>` +
    `<th>Conservación</th><th>Categoría</th></tr></thead><tbody>${body}</tbody></table>`
  );
}

export function buildLegalDocument(kind: LegalDocument, context: LegalContext): LegalSection[] {
  const b = context.business;
  const name = value(b.legalName, "denominación social");
  const nif = value(b.taxId, "NIF / CIF");
  const email = value(b.email, "correo de contacto");
  const hosting = b.hosting?.trim() ? escapeHtml(b.hosting) : "Cloudflare, Inc.";
  const domain = escapeHtml(context.domain);

  if (kind === "aviso-legal") {
    return [
      {
        heading: "Titular del sitio web",
        html:
          `<p>En cumplimiento del artículo 10 de la Ley 34/2002 de Servicios de la Sociedad de la ` +
          `Información y de Comercio Electrónico, se informa de los datos del titular de <strong>${domain}</strong>:</p>` +
          `<ul>` +
          `<li><strong>Titular:</strong> ${name}</li>` +
          (b.tradeName?.trim() ? `<li><strong>Nombre comercial:</strong> ${escapeHtml(b.tradeName)}</li>` : "") +
          `<li><strong>NIF:</strong> ${nif}</li>` +
          `<li><strong>Domicilio:</strong> ${fullAddress(b)}</li>` +
          `<li><strong>Correo electrónico:</strong> ${email}</li>` +
          (b.phone?.trim() ? `<li><strong>Teléfono:</strong> ${escapeHtml(b.phone)}</li>` : "") +
          (b.registry?.trim() ? `<li><strong>Datos registrales:</strong> ${escapeHtml(b.registry)}</li>` : "") +
          `<li><strong>Alojamiento:</strong> ${hosting}</li>` +
          `</ul>`,
      },
      {
        heading: "Condiciones de uso",
        html:
          `<p>El acceso a este sitio web es gratuito y atribuye la condición de usuario, que acepta ` +
          `estas condiciones desde ese momento. El usuario se compromete a usar el sitio conforme a ` +
          `la ley y a no realizar actividades que puedan dañarlo o impedir su uso normal.</p>`,
      },
      {
        heading: "Propiedad intelectual",
        html:
          `<p>Los contenidos de este sitio —textos, imágenes, marcas y código— pertenecen a ${name} o ` +
          `se usan con autorización, y están protegidos por la normativa de propiedad intelectual. No ` +
          `se permite su reproducción o distribución sin consentimiento expreso.</p>`,
      },
      {
        heading: "Responsabilidad",
        html:
          `<p>${name} no responde de los daños derivados del uso de la información de este sitio ni de ` +
          `los contenidos de sitios de terceros a los que se pueda enlazar.</p>`,
      },
      {
        heading: "Legislación aplicable",
        html:
          `<p>Esta relación se rige por la legislación española. Para cualquier controversia serán ` +
          `competentes los juzgados del domicilio del titular, salvo que la normativa de consumo ` +
          `disponga otro fuero.</p>`,
      },
    ];
  }

  if (kind === "privacidad") {
    const trackerNote = context.analytics
      ? `<p>Cuando lo autorizas mediante el aviso de cookies, este sitio usa herramientas de terceros ` +
        `para medir su uso. El detalle de cada una, con su proveedor y su plazo de conservación, está ` +
        `en la ${context.cookiesPath ? `<a href="${escapeHtml(context.cookiesPath)}">política de cookies</a>` : "política de cookies"}.</p>`
      : "";

    return [
      {
        heading: "Responsable del tratamiento",
        html:
          `<ul><li><strong>Responsable:</strong> ${name}</li><li><strong>NIF:</strong> ${nif}</li>` +
          `<li><strong>Domicilio:</strong> ${fullAddress(b)}</li>` +
          `<li><strong>Correo:</strong> ${email}</li>` +
          (b.dpoEmail?.trim()
            ? `<li><strong>Delegado de protección de datos:</strong> ${escapeHtml(b.dpoEmail)}</li>`
            : "") +
          `</ul>`,
      },
      {
        heading: "Qué datos tratamos y para qué",
        html:
          `<p>Sólo tratamos los datos que nos facilitas al escribirnos por el formulario de contacto o ` +
          `por correo: tu nombre, tu dirección de correo, tu teléfono si lo indicas y el contenido de tu ` +
          `mensaje.</p>` +
          `<p><strong>Finalidad:</strong> atender tu consulta y, si procede, preparar un presupuesto.</p>` +
          `<p><strong>Base jurídica:</strong> tu consentimiento, que otorgas al enviar el formulario ` +
          `(art. 6.1.a RGPD), y el interés legítimo en responder a quien nos contacta.</p>` +
          `<p><strong>Conservación:</strong> el tiempo necesario para atender tu consulta y, después, ` +
          `durante los plazos de prescripción legal que resulten aplicables.</p>` +
          trackerNote,
      },
      {
        heading: "A quién se comunican",
        html:
          `<p>No cedemos tus datos a terceros salvo obligación legal. Sí los tratan, por nuestra cuenta ` +
          `y bajo contrato de encargo de tratamiento, nuestros proveedores de alojamiento (${hosting}) y ` +
          `de correo electrónico.</p>`,
      },
      {
        heading: "Tus derechos",
        html:
          `<p>Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del ` +
          `tratamiento y portabilidad escribiendo a ${email}, acreditando tu identidad. También puedes ` +
          `retirar tu consentimiento en cualquier momento y presentar una reclamación ante la Agencia ` +
          `Española de Protección de Datos (<a href="https://www.aepd.es" rel="noopener noreferrer">aepd.es</a>) ` +
          `si consideras que no hemos atendido tu solicitud.</p>`,
      },
      {
        heading: "Seguridad",
        html:
          `<p>Aplicamos medidas técnicas y organizativas para proteger tus datos: cifrado en tránsito, ` +
          `control de acceso al gestor de contenidos y verificación anti-spam en los formularios.</p>`,
      },
    ];
  }

  // cookies
  const rows = cookieTable(context.analytics);
  const hasThirdParty = rows.some((r) => r.category !== "necesarias");

  return [
    {
      heading: "Qué es una cookie",
      html:
        `<p>Una cookie es un pequeño archivo que un sitio web guarda en tu dispositivo para recordar ` +
        `información sobre tu visita. Este aviso explica cuáles usa <strong>${domain}</strong>, para qué, ` +
        `y cómo puedes cambiar tu decisión.</p>`,
    },
    {
      heading: "Cookies que usa este sitio",
      html:
        (hasThirdParty
          ? `<p>Las cookies de terceros sólo se instalan si las aceptas. Hasta entonces no se carga ` +
            `ninguna de ellas.</p>`
          : `<p>Este sitio sólo usa cookies estrictamente necesarias para su funcionamiento, que no ` +
            `requieren tu consentimiento.</p>`) +
        cookieTableHtml(rows),
    },
    {
      heading: "Cómo cambiar tu decisión",
      html:
        `<p>Puedes revisar o retirar tu consentimiento en cualquier momento desde el enlace ` +
        `<em>Preferencias de cookies</em> del pie de página. También puedes borrar y bloquear cookies ` +
        `desde la configuración de tu navegador, aunque desactivar las necesarias puede impedir que ` +
        `algunas partes del sitio funcionen.</p>`,
    },
    ...(hasThirdParty
      ? [
          {
            heading: "Transferencias internacionales",
            html:
              `<p>Algunos proveedores tratan los datos fuera del Espacio Económico Europeo, amparados en ` +
              `las Cláusulas Contractuales Tipo aprobadas por la Comisión Europea. El detalle por ` +
              `proveedor figura en la tabla anterior y en sus respectivas políticas de privacidad.</p>`,
          },
        ]
      : []),
  ];
}

/** The whole document as one HTML string, for a renderer that just prints it. */
export function legalDocumentHtml(kind: LegalDocument, context: LegalContext): string {
  return buildLegalDocument(kind, context)
    .map((section) => `<h2>${escapeHtml(section.heading)}</h2>${section.html}`)
    .join("");
}
