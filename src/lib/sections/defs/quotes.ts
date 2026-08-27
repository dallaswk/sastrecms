import type { SectionDefinition } from "../types";

export const quotes: SectionDefinition = {
  type: "quotes",
  label: "Testimonios",
  description:
    "Citas de clientes con nombre, cargo y foto. En rejilla se leen todas de golpe; en " +
    "carrusel ocupan menos y pueden pasar solas. Una sola cita se pinta grande.",
  group: "prueba-social",
  icon: "❝",
  version: 2,
  fields: [
    { key: "title", label: "Titular de la sección", type: "text" },
    {
      key: "items",
      label: "Citas",
      type: "repeater",
      subfields: [
        { key: "quote", label: "Cita", type: "textarea", required: true },
        { key: "author", label: "Quién lo dice", type: "text", required: true },
        { key: "role", label: "Cargo o empresa", type: "text" },
        { key: "photo", label: "Foto", type: "image" },
      ],
    },
    { key: "layout", label: "Disposición", type: "select", options: ["rejilla", "carrusel"] },
    { key: "autoplay", label: "Pasar solas (carrusel)", type: "select", options: ["no", "sí"] },
  ],
  defaults: { layout: "rejilla", autoplay: "no" },
  migrate: (data) => ({ ...data }),
};
