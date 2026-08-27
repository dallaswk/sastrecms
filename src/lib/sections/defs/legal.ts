import type { SectionDefinition } from "../types";
import { LEGAL_DOCUMENTS, LEGAL_LABELS } from "@lib/legal";

export const legal: SectionDefinition = {
  type: "legal",
  label: "Documento legal",
  description:
    "Aviso legal, política de privacidad o política de cookies, generados a partir de los " +
    "datos de empresa de Ajustes. La tabla de cookies se deriva de los trackers configurados, " +
    "así que añadir un pixel la actualiza sola — que es la parte que nadie mantiene a mano.",
  group: "contenido",
  icon: "§",
  version: 1,
  fields: [
    {
      key: "document",
      label: "Documento",
      type: "select",
      options: [...LEGAL_DOCUMENTS],
      required: true,
    },
    {
      key: "show_disclaimer",
      label: "Mostrar aviso de que es una plantilla",
      type: "select",
      options: ["sí", "no"],
      help: "Quítalo sólo cuando un profesional haya revisado el texto.",
    },
  ],
  defaults: {
    document: "aviso-legal",
    show_disclaimer: "sí",
  },
};

/** Only used by the editor's help text. */
export const LEGAL_DOCUMENT_LABELS = LEGAL_LABELS;
