import type { SectionDefinition } from "../types";

export const logos: SectionDefinition = {
  type: "logos",
  label: "Logotipos de clientes",
  description:
    "Franja de logotipos de clientes, proveedores o certificaciones, igualados de altura " +
    "para que ninguno domine. Es prueba social de un vistazo, sin ocupar media pantalla. " +
    "Para fotos de obra o producto usa Galería, que las muestra a tamaño completo.",
  group: "prueba-social",
  icon: "◈",
  version: 2,
  fields: [
    { key: "title", label: "Texto de acompañamiento", type: "text" },
    { key: "images", label: "Logotipos", type: "gallery" },
    { key: "tone", label: "Tratamiento", type: "select", options: ["apagado", "a color"] },
  ],
  defaults: { tone: "apagado" },
  migrate: (data) => ({ ...data }),
};
