import type { SitePreset } from "../types";

export const basico: SitePreset = {
  key: "basico",
  label: "Web de presencia",
  description:
    "Lo mínimo que necesita cualquier negocio: quiénes son, qué hacen y cómo contactar. " +
    "El punto de partida cuando ninguno de los otros encaja.",
  tagline: "",
  theme: {
    daisyuiTheme: "light",
    primaryColor: "#2F4B8F",
    secondaryColor: "#4A6FA5",
    accentColor: "#C2703D",
    borderRadius: "0.5rem",
  },
  pages: [
    {
      slug: "index", title: "Inicio", publish: true,
      sections: [
        { type: "hero", anchor: "portada", data: {
          title: "El nombre del negocio",
          subtitle: "Una frase que explique qué hacéis y para quién, sin adjetivos.",
          cta_label: "Contactar", cta_url: "/contacto", align: "centro" } },
        { type: "features", anchor: "servicios", data: {
          title: "Qué hacemos", columns: "3",
          items: [
            { icon: "①", title: "Primer servicio", text: "Una frase que lo explique." },
            { icon: "②", title: "Segundo servicio", text: "Otra frase." },
            { icon: "③", title: "Tercer servicio", text: "Y otra." },
          ] } },
        { type: "split", data: {
          title: "Sobre nosotros", side: "derecha", image: "",
          body: "<p>Quiénes sois, desde cuándo y por qué alguien debería confiar en vosotros.</p>",
          cta_label: "", cta_url: "" } },
        { type: "cta", data: {
          title: "¿Hablamos?", text: "", button_label: "Contactar", button_url: "/contacto", tone: "color" } },
      ],
    },
    { slug: "sobre-nosotros", title: "Sobre nosotros", publish: true, sections: [
      { type: "prose", data: { title: "Sobre nosotros", width: "normal", body: "<p>La historia del negocio.</p>" } },
    ] },
    { slug: "contacto", title: "Contacto", publish: true, sections: [
      { type: "prose", data: { title: "Contacto", width: "estrecho", body: "<p>Teléfono, correo, dirección y horario.</p>" } },
      { type: "contact", data: {
        title: "Escríbenos",
        text: "Rellena el formulario y te contestamos en menos de 24 horas.",
        submit_label: "Enviar mensaje",
        consent_text: "He leído y acepto la política de privacidad y el tratamiento de mis datos para responder a esta consulta.",
        success_message: "Gracias, hemos recibido tu mensaje. Te respondemos en menos de 24 horas.",
        fields: [
          { key: "nombre", label: "Nombre", type: "text", required: "sí" },
          { key: "email", label: "Correo electrónico", type: "email", required: "sí" },
          { key: "telefono", label: "Teléfono", type: "tel" },
          { key: "mensaje", label: "Cuéntanos qué necesitas", type: "textarea", required: "sí" },
        ],
      } },
    ] },
    { slug: "aviso-legal", title: "Aviso legal", publish: true },
    { slug: "politica-de-privacidad", title: "Política de privacidad", publish: true },
    { slug: "politica-de-cookies", title: "Política de cookies", publish: true },
  ],
  menus: {
    main: [
      { label: "Sobre nosotros", slug: "sobre-nosotros" },
      { label: "Contacto", slug: "contacto" },
    ],
    legal: [
      { label: "Aviso legal", slug: "aviso-legal" },
      { label: "Privacidad", slug: "politica-de-privacidad" },
      { label: "Cookies", slug: "politica-de-cookies" },
    ],
  },
};
