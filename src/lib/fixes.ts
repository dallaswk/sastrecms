/**
 * Which checklist items can be fixed from a button, and which cannot.
 *
 * The distinction is the whole point of this file, and it is not «is it hard». It is:
 *
 *  - **auto** — the right answer is already knowable from what is in the database. Creating the
 *    three legal pages, or building a header menu out of the published top-level pages. No
 *    judgement, no waiting, and no way for it to be wrong.
 *  - **ai** — the right answer is prose that has to be written, and nobody can tell whether it
 *    is right until they read it. Always proposed and never saved without a person accepting it.
 *  - **manual** — the answer is information only the site owner has. A NIF, a contact address, a
 *    Resend key. An AI offering to fill these in would be inventing them, which is worse than
 *    leaving the row red.
 *
 * Putting all three behind one «arréglalo» button would hide that difference, and the third
 * group is exactly where hiding it does damage.
 */

export type FixKind = "auto" | "ai" | "manual";

export type FixDescriptor = {
  /** The check id from launch-checklist. */
  checkId: string;
  kind: FixKind;
  /** The button. Says what will happen, not «Arreglar». */
  label: string;
  /** Shown before an `auto` fix runs, when it creates or changes something visible. */
  confirm?: string;
  /** Why this one is not automatic. Shown instead of a button for `manual`. */
  because?: string;
};

export const FIXES: FixDescriptor[] = [
  {
    checkId: "legal",
    kind: "auto",
    label: "Crear las páginas",
    confirm:
      "Se crearán las páginas legales que falten, cada una con el bloque «Documento legal», " +
      "y se publicarán. El texto se genera con los datos de empresa de Ajustes.",
  },
  {
    checkId: "legal-menu",
    kind: "auto",
    label: "Añadirlos al pie",
    confirm: "Se añadirán al menú legal las páginas legales publicadas que falten en él.",
  },
  {
    checkId: "menu",
    kind: "auto",
    label: "Construir el menú",
    confirm:
      "Se creará el menú de cabecera con las páginas publicadas de primer nivel, en el orden " +
      "en que están en el árbol. Las legales se quedan fuera: van en el pie.",
  },
  {
    checkId: "contact-form",
    kind: "auto",
    label: "Añadir el formulario",
    confirm:
      "Se añadirá un formulario de contacto con los campos habituales a la página de contacto. " +
      "Si no existe, se creará.",
  },
  {
    checkId: "dimensions",
    kind: "auto",
    label: "Leer las dimensiones",
    confirm:
      "Se descargará cada imagen que no tenga dimensiones para leerlas de sus bytes. No " +
      "modifica los archivos.",
  },

  // ---- prose: proposed, never saved without a person reading it
  {
    checkId: "descriptions",
    kind: "ai",
    label: "Redactar con IA",
  },
  {
    checkId: "empty-pages",
    kind: "ai",
    label: "Redactar con IA",
  },
  {
    checkId: "alt",
    kind: "ai",
    label: "Describir con IA",
  },

  // ---- only the owner knows these
  {
    checkId: "business",
    kind: "manual",
    label: "Ir a Ajustes",
    because: "Son datos registrales tuyos. Inventárselos sería peor que dejarlo en rojo.",
  },
  {
    checkId: "contact-email",
    kind: "manual",
    label: "Ir a Ajustes",
    because: "Es una dirección tuya: nadie más puede saber a dónde quieres que lleguen.",
  },
  {
    checkId: "resend",
    kind: "manual",
    label: "Ir a Ajustes",
    because: "Hace falta una clave de Resend, que se saca de su panel.",
  },
  {
    checkId: "turnstile",
    kind: "manual",
    label: "Ir a Ajustes",
    because: "Las claves se crean en el panel de Cloudflare.",
  },
  {
    checkId: "branding",
    kind: "manual",
    label: "Ir a Ajustes",
    because: "El logo es un archivo tuyo. Súbelo en Medios y elígelo en Ajustes.",
  },
  {
    checkId: "identity",
    kind: "manual",
    label: "Ir a Ajustes",
    because: "El nombre del sitio lo decides tú.",
  },
  {
    checkId: "home",
    kind: "manual",
    label: "Ir a Contenido",
    because:
      "Crear una portada vacía sólo cambiaría este aviso por «hay una página publicada que no " +
      "muestra nada». Móntala con los bloques que quieras, o aplica un preset.",
  },
];

const BY_CHECK = new Map(FIXES.map((fix) => [fix.checkId, fix]));

export function fixFor(checkId: string): FixDescriptor | undefined {
  return BY_CHECK.get(checkId);
}

/** The ids a button can actually run. Used by the action to refuse anything else. */
export const AUTOMATIC_FIX_IDS = FIXES.filter((fix) => fix.kind === "auto").map((fix) => fix.checkId);

export function isAutomatic(checkId: string): boolean {
  return fixFor(checkId)?.kind === "auto";
}

/** The three legal pages, in the order they are created and listed. */
export const LEGAL_PAGES = [
  { slug: "aviso-legal", title: "Aviso legal", document: "aviso-legal", menuLabel: "Aviso legal" },
  { slug: "politica-de-privacidad", title: "Política de privacidad", document: "privacidad", menuLabel: "Privacidad" },
  { slug: "politica-de-cookies", title: "Política de cookies", document: "cookies", menuLabel: "Cookies" },
] as const;

/** Slugs that belong in the footer, not the header. */
export const LEGAL_SLUGS: string[] = LEGAL_PAGES.map((page) => page.slug);

/** The fields a contact form starts with. The same set the section's own defaults use. */
export const DEFAULT_CONTACT_FIELDS = [
  { key: "nombre", label: "Nombre", type: "text", required: "sí", width: "half" },
  { key: "email", label: "Correo electrónico", type: "email", required: "sí", width: "half" },
  { key: "telefono", label: "Teléfono", type: "tel", width: "half" },
  { key: "mensaje", label: "Cuéntanos qué necesitas", type: "textarea", required: "sí" },
] as const;

export type FixResult = {
  /** What happened, in one sentence, for the toast. */
  message: string;
  /** True when there was nothing left to do. */
  noop?: boolean;
  /** Anything created or changed, for the log. */
  changed?: string[];
};
