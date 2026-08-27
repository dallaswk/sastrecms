import type { SectionDefinition } from "../types";

export const hero: SectionDefinition = {
  type: "hero",
  label: "Portada",
  description:
    "Bloque de apertura a pantalla ancha: titular, texto de apoyo, imagen de fondo y un " +
    "botón. Se usa como primer bloque de una página; no pongas dos en la misma.",
  group: "cabecera",
  icon: "🏔",
  version: 1,
  fields: [
    { key: "title", label: "Titular", type: "text", required: true },
    { key: "subtitle", label: "Texto de apoyo", type: "textarea" },
    { key: "image", label: "Imagen de fondo", type: "image" },
    { key: "cta_label", label: "Texto del botón", type: "text" },
    { key: "cta_url", label: "Enlace del botón", type: "text" },
    { key: "align", label: "Alineación", type: "select", options: ["izquierda", "centro"] },
  ],
  defaults: { align: "centro" },
};
