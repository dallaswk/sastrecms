import type { SectionDefinition } from "../types";
import {
  DEFAULT_NOTIFY_BODY,
  DEFAULT_NOTIFY_SUBJECT,
  DEFAULT_REPLY_BODY,
  DEFAULT_REPLY_SUBJECT,
} from "@lib/forms/notify";

export const contact: SectionDefinition = {
  type: "contact",
  label: "Formulario de contacto",
  description:
    "Formulario cuyos campos, validaciones y correos defines tú. Los mensajes llegan a la " +
    "bandeja del backoffice y se avisa por correo. Los campos que declares aquí son los " +
    "únicos que el servidor acepta, así que quitar uno lo deja de admitir de inmediato.",
  group: "conversion",
  icon: "✉",
  version: 1,
  fields: [
    { key: "title", label: "Titular", type: "text" },
    { key: "text", label: "Texto de entrada", type: "textarea" },

    {
      key: "fields",
      label: "Campos del formulario",
      type: "formfields",
      help: "Arrastra para reordenar. La clave de un campo no se puede cambiar sin desligar las respuestas que ya hay en la bandeja.",
    },

    { key: "submit_label", label: "Texto del botón", type: "text" },
    {
      key: "consent_text",
      label: "Texto del consentimiento",
      type: "textarea",
      help: "Si lo dejas vacío no se pide consentimiento, que en España no es una opción para un formulario de contacto.",
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
      help: "Vacío usa el correo de contacto de Ajustes. Varios separados por comas.",
    },
    {
      key: "notify_subject",
      label: "Asunto del aviso",
      type: "text",
      help: "Admite marcadores como {{_sitio}} o {{nombre}}. Vacío usa el asunto por defecto.",
    },
    {
      key: "notify_body",
      label: "Cuerpo del aviso",
      type: "textarea",
      help: "{{_respuestas}} imprime la tabla con todo lo que ha rellenado el visitante.",
    },

    {
      key: "autoreply",
      label: "Acuse de recibo al visitante",
      type: "select",
      options: ["no", "sí"],
      help: "Se envía sólo a la dirección que el visitante escribe en un campo de correo del formulario.",
    },
    { key: "autoreply_subject", label: "Asunto del acuse", type: "text" },
    { key: "autoreply_body", label: "Cuerpo del acuse", type: "textarea" },
  ],
  defaults: {
    title: "Hablemos",
    submit_label: "Enviar mensaje",
    consent_text:
      "He leído y acepto la política de privacidad y el tratamiento de mis datos para " +
      "responder a esta consulta.",
    success_message: "Gracias, hemos recibido tu mensaje. Te respondemos en menos de 24 horas.",
    notify_subject: DEFAULT_NOTIFY_SUBJECT,
    notify_body: DEFAULT_NOTIFY_BODY,
    autoreply: "no",
    autoreply_subject: DEFAULT_REPLY_SUBJECT,
    autoreply_body: DEFAULT_REPLY_BODY,
    fields: [
      { key: "nombre", label: "Nombre", type: "text", required: "sí", width: "half" },
      { key: "email", label: "Correo electrónico", type: "email", required: "sí", width: "half" },
      { key: "telefono", label: "Teléfono", type: "tel", width: "half" },
      { key: "mensaje", label: "Cuéntanos qué necesitas", type: "textarea", required: "sí" },
    ],
  },
};
