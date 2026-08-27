import { missingBusinessFields, type BusinessInfo } from "./legal";
import { needsBanner } from "./consent";
import type { AnalyticsIds } from "./analytics";

/**
 * Is this site ready to hand over?
 *
 * The dashboard's reason to exist. The goal of the whole project is delivering a client site
 * in a day, and the thing that actually goes wrong is not building it — it is handing it over
 * with no legal notice, no contact email configured, or a menu pointing at a draft. Every
 * check here is something that has bitten a real launch.
 *
 * Pure, so the rules are testable without a database: the page gathers the snapshot, this
 * decides. Order matters — the list is read top to bottom and blockers come first.
 */

export type CheckStatus = "ok" | "warn" | "todo";

export type Check = {
  id: string;
  label: string;
  status: CheckStatus;
  /** Why it matters, or what exactly is missing. Shown under the label. */
  detail: string;
  /** Where to go and fix it. */
  href?: string;
  /** A blocker is something that should stop a handover; a warning is a should-fix. */
  blocking: boolean;
};

/** What the dashboard reads out of the database and hands to the checklist. */
export type SiteSnapshot = {
  siteName?: string | null;
  tagline?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  contactEmail?: string | null;
  business?: BusinessInfo | null;
  analytics: AnalyticsIds;
  integrations: Record<string, string>;
  /** Published paths, so the legal and home checks can look for them. */
  publishedPaths: string[];
  draftCount: number;
  /** Published pages with no meta description. */
  pagesWithoutDescription: string[];
  /** Images in the media library with no alt text. */
  imagesWithoutAlt: number;
  /** Images with no stored dimensions, which cause layout shift. */
  imagesWithoutDimensions: number;
  /** Entries in the main menu. */
  mainMenuItems: number;
  legalMenuItems: number;
  /** True when some published page carries a contact form. */
  hasContactForm: boolean;
  /** Published pages that carry no section blocks and no body: empty pages. */
  emptyPages: string[];
};

const LEGAL_SLUGS = ["aviso-legal", "politica-de-privacidad", "politica-de-cookies"];

function listOf(values: string[], max = 3): string {
  const shown = values.slice(0, max).join(", ");
  return values.length > max ? `${shown} y ${values.length - max} más` : shown;
}

export function buildChecklist(snapshot: SiteSnapshot): Check[] {
  const checks: Check[] = [];
  const published = new Set(snapshot.publishedPaths);

  // ---- blockers: things that make a handover wrong, not merely unpolished

  checks.push(
    published.has("/")
      ? { id: "home", label: "La portada está publicada", status: "ok", detail: "El sitio responde en su raíz.", blocking: true }
      : {
          id: "home",
          label: "Falta publicar la portada",
          status: "todo",
          detail: "Sin una página publicada en «/» el dominio no muestra nada.",
          href: "/admin/content",
          blocking: true,
        }
  );

  const missingLegal = LEGAL_SLUGS.filter((slug) => !published.has(`/${slug}`));
  checks.push(
    missingLegal.length === 0
      ? {
          id: "legal",
          label: "Las tres páginas legales están publicadas",
          status: "ok",
          detail: "Aviso legal, privacidad y cookies.",
          blocking: true,
        }
      : {
          id: "legal",
          label: `Faltan ${missingLegal.length} página(s) legal(es)`,
          status: "todo",
          detail: `${listOf(missingLegal)}. Son obligatorias en España, y el bloque «Documento legal» las escribe solo.`,
          href: "/admin/content",
          blocking: true,
        }
  );

  const missingBusiness = missingBusinessFields(snapshot.business);
  checks.push(
    missingBusiness.length === 0
      ? {
          id: "business",
          label: "Los datos de empresa están completos",
          status: "ok",
          detail: "El aviso legal y la privacidad se generan con ellos.",
          blocking: true,
        }
      : {
          id: "business",
          label: `Faltan ${missingBusiness.length} dato(s) de empresa`,
          status: "todo",
          detail: `${listOf(missingBusiness)}. Los documentos legales los marcan en amarillo hasta que estén.`,
          href: "/admin/settings",
          blocking: true,
        }
  );

  // A form nobody is told about is the worst of the lot: the visitor sends and thinks they
  // have been heard.
  if (snapshot.hasContactForm) {
    checks.push(
      snapshot.contactEmail?.trim()
        ? {
            id: "contact-email",
            label: "Los mensajes del formulario llegan por correo",
            status: "ok",
            detail: snapshot.contactEmail,
            blocking: true,
          }
        : {
            id: "contact-email",
            label: "Nadie recibe aviso de los mensajes",
            status: "todo",
            detail:
              "Hay un formulario publicado pero no hay correo de contacto configurado. Los mensajes se guardan en la bandeja, y nadie se enterará de que han llegado.",
            href: "/admin/settings",
            blocking: true,
          }
    );

    checks.push(
      snapshot.integrations.resendApiKey?.trim()
        ? {
            id: "resend",
            label: "El envío de correo está configurado",
            status: "ok",
            detail: "Clave de Resend presente.",
            blocking: true,
          }
        : {
            id: "resend",
            label: "El correo no puede salir",
            status: "todo",
            detail:
              "Sin clave de Resend el aviso del formulario falla y la bandeja lo marca en rojo. El mensaje sí se guarda.",
            href: "/admin/settings",
            blocking: true,
          }
    );
  } else {
    checks.push({
      id: "contact-form",
      label: "No hay formulario de contacto publicado",
      status: "warn",
      detail: "Añade el bloque «Formulario de contacto» a una página. Casi ninguna web de pyme se entrega sin uno.",
      href: "/admin/content",
      blocking: false,
    });
  }

  checks.push(
    snapshot.mainMenuItems > 0
      ? {
          id: "menu",
          label: "La cabecera tiene menú",
          status: "ok",
          detail: `${snapshot.mainMenuItems} enlace(s).`,
          blocking: true,
        }
      : {
          id: "menu",
          label: "La cabecera no tiene menú",
          status: "todo",
          detail: "Sólo se verá el logo, y no habrá forma de navegar entre páginas.",
          href: "/admin/menus",
          blocking: true,
        }
  );

  if (snapshot.emptyPages.length > 0) {
    checks.push({
      id: "empty-pages",
      label: `${snapshot.emptyPages.length} página(s) publicada(s) están vacías`,
      status: "todo",
      detail: `${listOf(snapshot.emptyPages)}. Responden 200 y no muestran nada.`,
      href: "/admin/content",
      blocking: true,
    });
  }

  // ---- warnings: the site works, but it is not finished

  checks.push(
    snapshot.legalMenuItems > 0
      ? {
          id: "legal-menu",
          label: "Los enlaces legales están en el pie",
          status: "ok",
          detail: `${snapshot.legalMenuItems} enlace(s).`,
          blocking: false,
        }
      : {
          id: "legal-menu",
          label: "Los enlaces legales no están en el pie",
          status: "warn",
          detail: "Publicadas no basta: tienen que ser accesibles desde cualquier página.",
          href: "/admin/menus",
          blocking: false,
        }
  );

  checks.push(
    snapshot.siteName?.trim()
      ? { id: "identity", label: "El sitio tiene nombre", status: "ok", detail: snapshot.siteName, blocking: false }
      : {
          id: "identity",
          label: "El sitio no tiene nombre",
          status: "warn",
          detail: "Sale en el título de cada página y en los resultados de búsqueda.",
          href: "/admin/settings",
          blocking: false,
        }
  );

  const brandingMissing = [
    !snapshot.logoUrl?.trim() ? "logo" : null,
    !snapshot.faviconUrl?.trim() ? "favicon" : null,
  ].filter(Boolean) as string[];
  checks.push(
    brandingMissing.length === 0
      ? { id: "branding", label: "Logo y favicon puestos", status: "ok", detail: "", blocking: false }
      : {
          id: "branding",
          label: `Falta el ${brandingMissing.join(" y el ")}`,
          status: "warn",
          detail:
            brandingMissing.includes("favicon")
              ? "Sin favicon la pestaña del navegador muestra el icono genérico."
              : "La cabecera mostrará el nombre en texto.",
          href: "/admin/settings",
          blocking: false,
        }
  );

  checks.push(
    snapshot.pagesWithoutDescription.length === 0
      ? {
          id: "descriptions",
          label: "Todas las páginas tienen descripción",
          status: "ok",
          detail: "Es lo que se lee bajo el título en Google.",
          blocking: false,
        }
      : {
          id: "descriptions",
          label: `${snapshot.pagesWithoutDescription.length} página(s) sin descripción`,
          status: "warn",
          detail: `${listOf(snapshot.pagesWithoutDescription)}. Google inventará el texto del resultado.`,
          href: "/admin/content",
          blocking: false,
        }
  );

  if (snapshot.imagesWithoutAlt > 0) {
    checks.push({
      id: "alt",
      label: `${snapshot.imagesWithoutAlt} imagen(es) sin texto alternativo`,
      status: "warn",
      detail: "Sin él son invisibles para un lector de pantalla y para la búsqueda de imágenes.",
      href: "/admin/media",
      blocking: false,
    });
  }

  if (snapshot.imagesWithoutDimensions > 0) {
    checks.push({
      id: "dimensions",
      label: `${snapshot.imagesWithoutDimensions} imagen(es) sin dimensiones`,
      status: "warn",
      detail:
        "Se subieron antes de que se guardaran. Provocan salto de maquetación al cargar; ejecuta el script de backfill.",
      href: "/admin/media",
      blocking: false,
    });
  }

  if (snapshot.hasContactForm && !snapshot.integrations.turnstileSecretKey?.trim()) {
    checks.push({
      id: "turnstile",
      label: "Turnstile no está configurado",
      status: "warn",
      detail: "El formulario sigue protegido por el honeypot y el límite de envíos, pero sin verificación de Cloudflare.",
      href: "/admin/settings",
      blocking: false,
    });
  }

  if (needsBanner(snapshot.analytics)) {
    checks.push({
      id: "consent",
      label: "Hay trackers configurados y el aviso de cookies los controla",
      status: "ok",
      detail: "No cargan hasta que el visitante los acepta.",
      blocking: false,
    });
  }

  return checks;
}

export type ChecklistSummary = {
  total: number;
  done: number;
  blockers: number;
  warnings: number;
  /** 0–100. What the ring shows. */
  progress: number;
  ready: boolean;
};

export function summarise(checks: Check[]): ChecklistSummary {
  const total = checks.length;
  const done = checks.filter((c) => c.status === "ok").length;
  const blockers = checks.filter((c) => c.status !== "ok" && c.blocking).length;
  const warnings = checks.filter((c) => c.status !== "ok" && !c.blocking).length;
  return {
    total,
    done,
    blockers,
    warnings,
    progress: total === 0 ? 100 : Math.round((done / total) * 100),
    // Ready means no blockers. A warning is something to improve, not something that makes
    // the handover wrong — treating both the same would make the badge never turn green.
    ready: blockers === 0,
  };
}
