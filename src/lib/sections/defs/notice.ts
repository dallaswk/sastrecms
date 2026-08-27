import type { SectionDefinition } from "../types";
export const notice: SectionDefinition = {
  type: "notice",
  label: "Aviso",
  description:
    "Franja estrecha para un aviso temporal: horario especial, obras, una fecha límite. " +
    "Ocúltala en vez de borrarla cuando pase, y así queda lista para la próxima.",
  group: "cabecera",
  icon: "⚑",
  version: 1,
  fields: [
    { key: "text", label: "Texto", type: "text", required: true },
    { key: "link_label", label: "Texto del enlace", type: "text" },
    { key: "link_url", label: "Enlace", type: "text" },
    { key: "tone", label: "Tono", type: "select", options: ["info", "aviso", "urgente"] },
  ],
  defaults: { tone: "info" },
};
