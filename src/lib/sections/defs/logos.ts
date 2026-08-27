import type { SectionDefinition } from "../types";
export const logos: SectionDefinition = {
  type: "logos",
  label: "Logotipos",
  description:
    "Fila de logotipos de clientes o certificaciones, en escala de grises y a altura " +
    "pareja para que ninguno domine. Prueba social sin ocupar media pantalla.",
  group: "prueba-social",
  icon: "◈",
  version: 1,
  fields: [
    { key: "title", label: "Texto de acompañamiento", type: "text" },
    { key: "images", label: "Logotipos", type: "gallery" },
  ],
};
