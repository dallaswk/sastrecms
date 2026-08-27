import type { SectionDefinition } from "../types";
export const pricing: SectionDefinition = {
  type: "pricing",
  label: "Precios",
  description:
    "Planes en columnas, con precio, lista de lo que incluye y botón. Marca uno como " +
    "destacado para guiar la elección; marcar todos equivale a no marcar ninguno.",
  group: "conversion",
  icon: "€",
  version: 1,
  fields: [
    { key: "title", label: "Titular", type: "text" },
    { key: "intro", label: "Entradilla", type: "textarea" },
    {
      key: "plans", label: "Planes", type: "repeater",
      subfields: [
        { key: "name", label: "Nombre", type: "text", required: true },
        { key: "price", label: "Precio", type: "text", required: true },
        { key: "period", label: "Periodo", type: "text" },
        { key: "description", label: "Para quién es", type: "textarea" },
        { key: "features", label: "Incluye (una por línea)", type: "textarea" },
        { key: "button_label", label: "Texto del botón", type: "text" },
        { key: "button_url", label: "Enlace", type: "text" },
        { key: "featured", label: "Destacado", type: "select", options: ["no", "sí"] },
      ],
    },
  ],
};
