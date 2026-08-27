import type { SectionDefinition } from "../types";

export const steps: SectionDefinition = {
  type: "steps",
  label: "Pasos",
  description:
    "Secuencia numerada. Úsala sólo cuando el orden signifique algo de verdad — un " +
    "proceso, un cómo funciona. Para una lista sin orden, usa Prestaciones.",
  group: "contenido",
  icon: "①",
  version: 1,
  fields: [
    { key: "title", label: "Titular de la sección", type: "text" },
    {
      key: "items",
      label: "Pasos",
      type: "repeater",
      subfields: [
        { key: "title", label: "Titular del paso", type: "text", required: true },
        { key: "text", label: "Texto", type: "textarea" },
      ],
    },
  ],
};
