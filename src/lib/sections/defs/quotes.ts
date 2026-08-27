import type { SectionDefinition } from "../types";

export const quotes: SectionDefinition = {
  type: "quotes",
  label: "Testimonios",
  description:
    "Citas de clientes con nombre, cargo y foto opcional. Una sola cita se pinta grande; " +
    "varias, en rejilla.",
  group: "prueba-social",
  icon: "❝",
  version: 1,
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
  ],
};
