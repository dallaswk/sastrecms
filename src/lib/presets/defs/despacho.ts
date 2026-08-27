import type { SitePreset } from "../types";

export const despacho: SitePreset = {
  key: "despacho",
  label: "Despacho profesional",
  description:
    "Abogados, asesorías, arquitectura, consultoría. Se apoya en las áreas de práctica y " +
    "en el equipo, que es lo que mira quien contrata a un profesional.",
  tagline: "Asesoramiento cercano y sin sorpresas",
  theme: {
    daisyuiTheme: "light",
    primaryColor: "#1F3A5F",
    secondaryColor: "#3E5C76",
    accentColor: "#B4813A",
    borderRadius: "0.375rem",
  },
  contentTypes: [
    {
      key: "area",
      label: "Área de práctica",
      icon: "⚖️",
      supportsChildren: false,
      fieldSchema: [
        { key: "resumen", label: "Resumen", type: "textarea" },
        { key: "body", label: "Detalle", type: "richtext" },
      ],
    },
  ],
  pages: [
    {
      slug: "index", title: "Inicio", publish: true,
      sections: [
        { type: "hero", anchor: "portada", data: {
          title: "Asesoramiento cercano y sin sorpresas",
          subtitle: "Explicamos cada paso antes de darlo y decimos el precio por adelantado.",
          cta_label: "Pide una primera consulta", cta_url: "/contacto", align: "izquierda" } },
        { type: "features", anchor: "areas", data: {
          title: "En qué podemos ayudarte", columns: "3",
          items: [
            { icon: "⚖️", title: "Derecho civil", text: "Contratos, herencias, arrendamientos y reclamaciones." },
            { icon: "🏢", title: "Mercantil", text: "Constitución de sociedades, pactos entre socios y contratos." },
            { icon: "📄", title: "Laboral", text: "Despidos, convenios y relaciones con la Seguridad Social." },
          ] } },
        { type: "steps", anchor: "como-trabajamos", data: {
          title: "Cómo trabajamos",
          items: [
            { title: "Primera consulta", text: "Sin coste y sin compromiso. Nos cuentas el caso y te decimos si tiene recorrido." },
            { title: "Presupuesto cerrado", text: "Por escrito y antes de empezar. Sin facturas sorpresa." },
            { title: "Un interlocutor", text: "La misma persona lleva tu asunto de principio a fin." },
          ] } },
        { type: "team", anchor: "equipo", data: { title: "Quiénes somos", items: [] } },
        { type: "cta", data: {
          title: "Cuéntanos tu caso", text: "La primera consulta no cuesta nada.",
          button_label: "Escríbenos", button_url: "/contacto", tone: "color" } },
      ],
    },
    { slug: "areas", title: "Áreas de práctica", publish: true, sections: [
      { type: "prose", data: { title: "Áreas de práctica", width: "normal",
        body: "<p>Describe aquí cada área con el detalle que un cliente necesita para reconocerse en ella.</p>" } },
    ] },
    { slug: "equipo", title: "Equipo", publish: true, sections: [
      { type: "team", data: { title: "El equipo", items: [] } },
    ] },
    { slug: "contacto", title: "Contacto", publish: true, sections: [
      { type: "prose", data: { title: "Contacto", width: "estrecho",
        body: "<p>Teléfono, dirección y horario de atención.</p>" } },
      { type: "contact", data: {
        title: "Solicita una primera consulta",
        text: "Cuéntanos tu caso sin compromiso. Todo lo que nos escribas queda amparado por el secreto profesional.",
        submit_label: "Solicitar consulta",
        consent_text: "He leído y acepto la política de privacidad y el tratamiento de mis datos para atender mi solicitud.",
        success_message: "Hemos recibido tu solicitud. Te llamamos en el próximo día laborable.",
        fields: [
          { key: "nombre", label: "Nombre y apellidos", type: "text", required: "sí" },
          { key: "email", label: "Correo electrónico", type: "email", required: "sí" },
          { key: "telefono", label: "Teléfono", type: "tel", required: "sí" },
          { key: "area", label: "Área", type: "select", required: "sí",
            options: "Civil\nLaboral\nFiscal\nMercantil\nOtra" },
          { key: "mensaje", label: "Resume tu caso", type: "textarea", required: "sí" },
        ],
      } },
    ] },
    { slug: "aviso-legal", title: "Aviso legal", publish: true },
    { slug: "politica-de-privacidad", title: "Política de privacidad", publish: true },
    { slug: "politica-de-cookies", title: "Política de cookies", publish: true },
  ],
  menus: {
    main: [
      { label: "Áreas", slug: "areas" },
      { label: "Equipo", slug: "equipo" },
      { label: "Contacto", slug: "contacto" },
    ],
    legal: [
      { label: "Aviso legal", slug: "aviso-legal" },
      { label: "Privacidad", slug: "politica-de-privacidad" },
      { label: "Cookies", slug: "politica-de-cookies" },
    ],
  },
};
