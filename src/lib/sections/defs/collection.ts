import type { SectionDefinition } from "../types";

export const collection: SectionDefinition = {
  type: "collection",
  label: "Listado de contenido",
  description:
    "Muestra los hijos publicados de otra página: las últimas noticias del blog, los " +
    "proyectos del portfolio, los servicios. Es un solo bloque para todos esos casos " +
    "porque lo único que cambia es de qué página cuelgan. Se actualiza solo al publicar.",
  group: "contenido",
  icon: "☰",
  version: 1,
  fields: [
    { key: "title", label: "Titular", type: "text" },
    {
      key: "parent",
      label: "Contenido de esta página",
      type: "relation",
      required: true,
    },
    { key: "limit", label: "Cuántos mostrar", type: "number" },
    { key: "layout", label: "Disposición", type: "select", options: ["rejilla", "lista"] },
    { key: "show_image", label: "Mostrar imagen", type: "select", options: ["sí", "no"] },
    { key: "more_label", label: "Texto del enlace «ver todo»", type: "text" },
  ],
  defaults: { limit: 6, layout: "rejilla", show_image: "sí" },
};
