import type { SectionDefinition } from "../types";

export const features: SectionDefinition = {
  type: "features",
  label: "Prestaciones",
  description:
    "Rejilla de tarjetas cortas, cada una con icono, titular y una frase. Para enumerar " +
    "servicios o características. El orden no significa nada: si es un proceso, usa Pasos.",
  group: "contenido",
  icon: "▦",
  version: 1,
  fields: [
    { key: "title", label: "Titular de la sección", type: "text" },
    { key: "intro", label: "Entradilla", type: "textarea" },
    {
      key: "items",
      label: "Tarjetas",
      type: "repeater",
      subfields: [
        { key: "icon", label: "Icono (emoji)", type: "text" },
        { key: "title", label: "Titular", type: "text", required: true },
        { key: "text", label: "Texto", type: "textarea" },
      ],
    },
    { key: "columns", label: "Columnas", type: "select", options: ["2", "3", "4"] },
  ],
  defaults: { columns: "3" },
};
