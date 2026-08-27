import type { SectionDefinition } from "../types";
export const stats: SectionDefinition = {
  type: "stats",
  label: "Cifras",
  description:
    "Tres o cuatro números grandes con su etiqueta. Sólo funciona con cifras concretas y " +
    "comprobables; con datos vagos resta credibilidad en vez de sumarla.",
  group: "prueba-social",
  icon: "📊",
  version: 1,
  fields: [
    { key: "title", label: "Titular", type: "text" },
    {
      key: "items", label: "Cifras", type: "repeater",
      subfields: [
        { key: "value", label: "Cifra", type: "text", required: true },
        { key: "label", label: "Qué mide", type: "text", required: true },
      ],
    },
  ],
};
