import type { SectionDefinition } from "../types";

export const cta: SectionDefinition = {
  type: "cta",
  label: "Llamada a la acción",
  description:
    "Franja de cierre con un titular corto y un botón. Pensada para el final de una " +
    "página de servicio o una landing.",
  group: "conversion",
  icon: "🎯",
  version: 1,
  fields: [
    { key: "title", label: "Titular", type: "text", required: true },
    { key: "text", label: "Texto", type: "textarea" },
    { key: "button_label", label: "Texto del botón", type: "text", required: true },
    { key: "button_url", label: "Enlace del botón", type: "text", required: true },
    { key: "tone", label: "Fondo", type: "select", options: ["claro", "oscuro", "color"] },
  ],
  defaults: { tone: "color" },
};
