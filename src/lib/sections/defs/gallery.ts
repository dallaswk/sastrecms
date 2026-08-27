import type { SectionDefinition } from "../types";
export const gallery: SectionDefinition = {
  type: "gallery",
  label: "Galería",
  description:
    "Rejilla de imágenes con pie opcional. Para obra hecha, instalaciones o producto. " +
    "Si son logotipos de clientes, usa Logotipos, que los trata en gris y a un tamaño parejo.",
  group: "medios",
  icon: "🖼",
  version: 1,
  fields: [
    { key: "title", label: "Titular", type: "text" },
    { key: "images", label: "Imágenes", type: "gallery" },
    { key: "columns", label: "Columnas", type: "select", options: ["2", "3", "4"] },
  ],
  defaults: { columns: "3" },
};
