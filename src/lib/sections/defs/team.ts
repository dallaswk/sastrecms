import type { SectionDefinition } from "../types";
export const team: SectionDefinition = {
  type: "team",
  label: "Equipo",
  description:
    "Fichas de personas con foto, nombre y cargo. En una pyme suele ser el bloque que " +
    "más se mira: pon fotos reales, no de banco de imágenes.",
  group: "prueba-social",
  icon: "👥",
  version: 1,
  fields: [
    { key: "title", label: "Titular", type: "text" },
    {
      key: "items", label: "Personas", type: "repeater",
      subfields: [
        { key: "name", label: "Nombre", type: "text", required: true },
        { key: "role", label: "Cargo", type: "text" },
        { key: "photo", label: "Foto", type: "image" },
        { key: "bio", label: "Una línea", type: "textarea" },
      ],
    },
  ],
};
