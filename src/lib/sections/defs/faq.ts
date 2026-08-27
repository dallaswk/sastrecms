import type { SectionDefinition } from "../types";

export const faq: SectionDefinition = {
  type: "faq",
  label: "Preguntas frecuentes",
  description:
    "Lista de preguntas y respuestas plegables. Es también la fuente del JSON-LD FAQPage, " +
    "así que escribe preguntas tal y como las buscaría alguien.",
  group: "contenido",
  icon: "?",
  version: 1,
  fields: [
    { key: "title", label: "Titular de la sección", type: "text" },
    {
      key: "items",
      label: "Preguntas",
      type: "repeater",
      subfields: [
        { key: "question", label: "Pregunta", type: "text", required: true },
        { key: "answer", label: "Respuesta", type: "textarea", required: true },
      ],
    },
  ],
};
