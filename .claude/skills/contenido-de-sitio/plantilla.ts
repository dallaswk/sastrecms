#!/usr/bin/env node
import { ejecutar, type Contenido, type Pagina, type EntradaMenu } from "./lib/site-seed";
import type { ImagenRemota } from "./lib/site-media";

/**
 * Plantilla: cópiala a `scripts/<sitio>.ts` y cambia el contenido.
 *
 *   npx tsx scripts/<sitio>.ts --dry     # enseña qué haría
 *   npx tsx scripts/<sitio>.ts           # escribe
 *
 * Ejemplo completo, con tipo de contenido propio, formulario, blog y legales:
 * `scripts/clinica.ts`. La maquinaria está en `scripts/lib/site-seed.ts`.
 */

const TENANT = "slug-del-inquilino";

/*
 * La paleta. Elige con un criterio y déjalo escrito: el color por defecto del sector suele
 * ser el que hace que la web parezca de plantilla. Las tipografías del sistema no cuestan
 * una petición ni mandan la IP del visitante a Google.
 */
const THEME = {
  daisyuiTheme: "light",
  primaryColor: "#3F5D52",
  secondaryColor: "#C2A78E",
  accentColor: "#B4643A",
  baseColor: "#FBF8F4",
  borderRadius: "0.75rem",
  fontHeading: "system-serif",
  fontBody: "system",
  containerWidth: "normal",
  typeScale: "amplia",
};

/** De aquí salen el aviso legal y la política de privacidad. Sin esto salen con huecos. */
const BUSINESS = {
  legalName: "",
  tradeName: "",
  taxId: "",
  address: "",
  postalCode: "",
  city: "",
  province: "",
  country: "España",
  email: "",
  phone: "",
  registry: "",
  hosting: "Cloudflare, Inc.",
};

/** Fotos: se descargan al sembrar y se referencian con `@clave` desde los bloques. */
const IMAGENES: ImagenRemota[] = [
  // { key: "portada", url: "https://…", alt: "Qué se ve en la foto", credit: "Pexels · 000000" },
];

const PAGINAS: Pagina[] = [
  {
    slug: "index", // la portada: se sirve en "/"
    title: "Nombre del negocio",
    position: 0,
    seo: { metaTitle: "", metaDescription: "" },
    sections: [
      {
        type: "hero",
        anchor: "portada",
        data: {
          title: "",
          subtitle: "",
          cta_label: "Contactar",
          cta_url: "/contacto",
          align: "izquierda",
          image: "", // o "@portada", si está declarada arriba
        },
      },
      {
        type: "features",
        anchor: "servicios",
        data: {
          title: "",
          intro: "",
          columns: "3",
          items: [{ icon: "", title: "", text: "" }],
        },
      },
      {
        type: "cta",
        data: { title: "", text: "", button_label: "Contactar", button_url: "/contacto", tone: "color" },
      },
    ],
  },
  {
    slug: "contacto",
    title: "Contacto",
    position: 1,
    sections: [
      {
        type: "contact",
        data: {
          title: "Escríbenos",
          text: "",
          submit_label: "Enviar",
          consent_text: "He leído y acepto la política de privacidad.",
          success_message: "Gracias, te respondemos en menos de 24 horas.",
          notify_email: "",
          fields: [
            { key: "nombre", label: "Nombre", type: "text", required: "sí", width: "half" },
            { key: "email", label: "Correo electrónico", type: "email", required: "sí", width: "half" },
            { key: "mensaje", label: "Cuéntanos qué necesitas", type: "textarea", required: "sí" },
          ],
        },
      },
    ],
  },
  // Las tres son obligatorias en España y su texto se genera de `business`.
  { slug: "aviso-legal", title: "Aviso legal", position: 2,
    sections: [{ type: "legal", data: { document: "aviso-legal", show_disclaimer: "sí" } }] },
  { slug: "politica-de-privacidad", title: "Política de privacidad", position: 3,
    sections: [{ type: "legal", data: { document: "privacidad", show_disclaimer: "sí" } }] },
  { slug: "politica-de-cookies", title: "Política de cookies", position: 4,
    sections: [{ type: "legal", data: { document: "cookies", show_disclaimer: "sí" } }] },
];

/** Los menús guardan ids: aquí se declaran por ruta y el sembrador los resuelve. */
const MENUS: Record<"main" | "footer" | "legal", EntradaMenu[]> = {
  main: [{ label: "Contacto", path: "/contacto" }],
  footer: [],
  legal: [
    { label: "Aviso legal", path: "/aviso-legal" },
    { label: "Privacidad", path: "/politica-de-privacidad" },
    { label: "Cookies", path: "/politica-de-cookies" },
  ],
};

const CONTENIDO: Contenido = {
  tenant: TENANT,
  siteName: "Nombre del negocio",
  tagline: "",
  theme: THEME,
  business: BUSINESS,
  contactEmail: "",
  images: IMAGENES,
  pages: PAGINAS,
  menus: MENUS,
  // retire: ["/pagina-vieja"],   // a la papelera, no borradas
};

await ejecutar(CONTENIDO);
