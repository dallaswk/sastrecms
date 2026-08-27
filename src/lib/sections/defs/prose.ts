import type { SectionDefinition } from "../types";

export const prose: SectionDefinition = {
  type: "prose",
  label: "Texto",
  description:
    "Un bloque de texto con formato: titular opcional y cuerpo enriquecido. El comodín " +
    "para todo lo que no encaja en un bloque con forma propia.",
  group: "contenido",
  icon: "¶",
  version: 1,
  fields: [
    { key: "title", label: "Titular", type: "text" },
    { key: "body", label: "Texto", type: "richtext", required: true },
    { key: "width", label: "Ancho", type: "select", options: ["estrecho", "normal"] },
  ],
  defaults: { width: "normal" },
};
