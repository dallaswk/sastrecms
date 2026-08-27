import type { SitePreset } from "../types";

export const oficio: SitePreset = {
  key: "oficio",
  label: "Empresa de servicios u oficio",
  description:
    "Reformas, instalaciones, mantenimiento, limpieza. Gira alrededor de la obra hecha y " +
    "de la confianza: fotos de trabajos, zona de actuación y presupuesto sin compromiso.",
  tagline: "Trabajo bien hecho, y a tiempo",
  theme: {
    daisyuiTheme: "light",
    primaryColor: "#1D4E4A",
    secondaryColor: "#3F6F6A",
    accentColor: "#D08A2C",
    borderRadius: "0.5rem",
  },
  contentTypes: [
    {
      key: "proyecto",
      label: "Trabajo realizado",
      icon: "🔨",
      fieldSchema: [
        { key: "excerpt", label: "Resumen", type: "textarea" },
        { key: "cover_image", label: "Foto principal", type: "image" },
        { key: "gallery", label: "Más fotos", type: "gallery" },
        { key: "localidad", label: "Localidad", type: "text" },
        { key: "body", label: "Descripción", type: "richtext" },
      ],
    },
  ],
  pages: [
    {
      slug: "index", title: "Inicio", publish: true,
      sections: [
        { type: "hero", anchor: "portada", data: {
          title: "Trabajo bien hecho, y a tiempo",
          subtitle: "Presupuesto sin compromiso en 48 horas. Empezamos cuando decimos que empezamos.",
          cta_label: "Pedir presupuesto", cta_url: "/contacto", align: "centro" } },
        { type: "features", anchor: "servicios", data: {
          title: "Qué hacemos", columns: "3",
          items: [
            { icon: "🏠", title: "Reformas integrales", text: "Proyecto, licencias y ejecución, con una sola interlocución." },
            { icon: "🚿", title: "Baños y cocinas", text: "Los dos trabajos donde más se nota el acabado." },
            { icon: "🔧", title: "Mantenimiento", text: "Avisos puntuales y contratos para comunidades." },
          ] } },
        { type: "collection", anchor: "trabajos", data: {
          title: "Trabajos recientes", parent: "trabajos", limit: 6,
          layout: "rejilla", show_image: "sí", more_label: "Ver todos" } },
        { type: "stats", data: { title: "", items: [
          { value: "20", label: "Años trabajando en la zona" },
          { value: "450", label: "Obras entregadas" },
          { value: "48 h", label: "Para tener tu presupuesto" },
        ] } },
        { type: "quotes", anchor: "opiniones", data: { title: "Lo que dicen los clientes", layout: "carrusel", autoplay: "no", items: [] } },
        { type: "cta", data: {
          title: "¿Hablamos de tu obra?", text: "Vamos a verla, la medimos y te pasamos precio cerrado.",
          button_label: "Pedir presupuesto", button_url: "/contacto", tone: "color" } },
      ],
    },
    { slug: "servicios", title: "Servicios", publish: true, sections: [
      { type: "prose", data: { title: "Servicios", width: "normal", body: "<p>Detalla cada servicio: qué incluye, cuánto tarda y qué no incluye.</p>" } },
    ] },
    { slug: "trabajos", title: "Trabajos", publish: true, sections: [
      { type: "collection", data: { title: "Trabajos realizados", parent: "trabajos", limit: 12, layout: "rejilla", show_image: "sí", more_label: "" } },
    ] },
    { slug: "contacto", title: "Contacto", publish: true, sections: [
      { type: "prose", data: { title: "Pide presupuesto", width: "estrecho", body: "<p>Teléfono, WhatsApp y zona de actuación.</p>" } },
    ] },
    { slug: "aviso-legal", title: "Aviso legal", publish: true },
    { slug: "politica-de-privacidad", title: "Política de privacidad", publish: true },
    { slug: "politica-de-cookies", title: "Política de cookies", publish: true },
  ],
  menus: {
    main: [
      { label: "Servicios", slug: "servicios" },
      { label: "Trabajos", slug: "trabajos" },
      { label: "Contacto", slug: "contacto" },
    ],
    legal: [
      { label: "Aviso legal", slug: "aviso-legal" },
      { label: "Privacidad", slug: "politica-de-privacidad" },
      { label: "Cookies", slug: "politica-de-cookies" },
    ],
  },
};
