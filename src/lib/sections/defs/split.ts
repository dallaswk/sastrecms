import type { SectionDefinition } from "../types";
export const split: SectionDefinition = {
  type: "split",
  label: "Texto e imagen",
  description:
    "Media pantalla de texto y media de imagen. Alternar el lado en bloques consecutivos " +
    "da ritmo a una página larga.",
  group: "contenido",
  icon: "◐",
  version: 1,
  fields: [
    { key: "title", label: "Titular", type: "text", required: true },
    { key: "body", label: "Texto", type: "richtext" },
    { key: "image", label: "Imagen", type: "image" },
    { key: "side", label: "Lado de la imagen", type: "select", options: ["derecha", "izquierda"] },
    { key: "cta_label", label: "Texto del enlace", type: "text" },
    { key: "cta_url", label: "Enlace", type: "text" },
  ],
  defaults: { side: "derecha" },
};
