import type { SectionDefinition } from "../types";
import { FORM_FIELD_TYPES, FORM_FIELD_LABELS } from "@lib/forms/types";

export const contact: SectionDefinition = {
  type: "contact",
  label: "Formulario de contacto",
  description:
    "Formulario cuyos campos defines tú. Los mensajes llegan a la bandeja del backoffice y " +
    "se avisa por correo. Los campos que declares aquí son los únicos que el servidor acepta, " +
    "así que quitar uno lo deja de admitir de inmediato.",
  group: "conversion",
  icon: "✉",
  version: 1,
  fields: [
    { key: "title", label: "Titular", type: "text" },
    { key: "text", label: "Texto de entrada", type: "textarea" },
    {
      key: "fields",
      label: "Campos del formulario",
      type: "repeater",
      subfields: [
        {
          key: "key",
          label: "Clave",
          type: "text",
          required: true,
        },
        { key: "label", label: "Etiqueta visible", type: "text", required: true },
        {
          key: "type",
          label: "Tipo",
          type: "select",
          options: [...FORM_FIELD_TYPES],
          required: true,
        },
        { key: "required", label: "Obligatorio", type: "select", options: ["no", "sí"] },
        { key: "placeholder", label: "Texto de ejemplo", type: "text" },
        {
          key: "options",
          label: "Opciones del desplegable (una por línea)",
          type: "textarea",
        },
      ],
    },
    { key: "submit_label", label: "Texto del botón", type: "text" },
    {
      key: "consent_text",
      label: "Texto del consentimiento",
      type: "textarea",
    },
    {
      key: "success_message",
      label: "Mensaje al enviar",
      type: "textarea",
    },
    {
      key: "notify_email",
      label: "Avisar a este correo",
      type: "text",
    },
  ],
  defaults: {
    title: "Hablemos",
    submit_label: "Enviar mensaje",
    consent_text:
      "He leído y acepto la política de privacidad y el tratamiento de mis datos para " +
      "responder a esta consulta.",
    success_message: "Gracias, hemos recibido tu mensaje. Te respondemos en menos de 24 horas.",
    fields: [
      { key: "nombre", label: "Nombre", type: "text", required: "sí" },
      { key: "email", label: "Correo electrónico", type: "email", required: "sí" },
      { key: "telefono", label: "Teléfono", type: "tel" },
      { key: "mensaje", label: "Cuéntanos qué necesitas", type: "textarea", required: "sí" },
    ],
  },
};

/** Only used by the editor's help text; the labels live with the form types. */
export const CONTACT_FIELD_TYPE_LABELS = FORM_FIELD_LABELS;
