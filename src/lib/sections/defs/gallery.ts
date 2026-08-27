import type { SectionDefinition } from "../types";

export const gallery: SectionDefinition = {
  type: "gallery",
  label: "Galería",
  description:
    "Imágenes en rejilla, mosaico o carrusel, con ampliación al pulsar. Para obra hecha, " +
    "instalaciones o producto. Si son logotipos de clientes, usa Logotipos, que los " +
    "iguala de tamaño y los apaga para que no compitan con el contenido.",
  group: "medios",
  icon: "🖼",
  version: 2,
  fields: [
    { key: "title", label: "Titular", type: "text" },
    { key: "images", label: "Imágenes", type: "gallery" },
    { key: "layout", label: "Disposición", type: "select", options: ["rejilla", "mosaico", "carrusel"] },
    { key: "columns", label: "Columnas (rejilla y mosaico)", type: "select", options: ["2", "3", "4"] },
    { key: "lightbox", label: "Ampliar al pulsar", type: "select", options: ["sí", "no"] },
  ],
  defaults: { layout: "rejilla", columns: "3", lightbox: "sí" },
  /**
   * v1 had no layout or lightbox. Both default in, so the only thing to carry over is the
   * data itself — but the migration has to exist and be total, or a v1 block saved before
   * today would come back missing its images.
   */
  migrate: (data) => ({ ...data }),
};
