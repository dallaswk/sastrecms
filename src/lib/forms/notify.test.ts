import { describe, it, expect } from "vitest";
import { buildNotification } from "./notify";
import { parseFormFields } from "./validate";

const fields = parseFormFields([
  { key: "nombre", label: "Nombre", type: "text" },
  { key: "email", label: "Correo", type: "email" },
  { key: "telefono", label: "Teléfono", type: "tel" },
  { key: "mensaje", label: "Mensaje", type: "textarea" },
]);

const base = {
  fields,
  values: {
    nombre: "Ana Ruiz",
    email: "ana@ejemplo.es",
    mensaje: "Quiero reformar el baño.\nLlamadme por la tarde.",
  },
  sender: { name: "Ana Ruiz", email: "ana@ejemplo.es" },
  siteName: "Reformas Ruiz",
  pageTitle: "Contacto",
  pageUrl: "https://reformas.test/contacto",
  to: "avisos@reformas.test",
  date: "27 de agosto de 2026, 14:30",
};

describe("buildNotification", () => {
  it("pone el nombre en el asunto, que es lo que se ve en el móvil", () => {
    expect(buildNotification(base).subject).toBe("Nuevo mensaje desde Reformas Ruiz: Ana Ruiz");
  });

  it("no repite el nombre si el asunto propio ya lo incluye", () => {
    const payload = buildNotification({ ...base, subjectTemplate: "Consulta de {{nombre}}" });
    expect(payload.subject).toBe("Consulta de Ana Ruiz");
  });

  it("usa el asunto y el cuerpo que escribe el dueño del sitio", () => {
    const payload = buildNotification({
      ...base,
      subjectTemplate: "[web] {{nombre}} pregunta",
      bodyTemplate: "Teléfono: {{telefono}}\n\n{{_respuestas}}",
    });
    expect(payload.subject).toBe("[web] Ana Ruiz pregunta");
    expect(payload.html).toContain("Teléfono:");
  });

  it("responder al correo escribe a quien lo envió", () => {
    expect(buildNotification(base).replyTo).toBe("ana@ejemplo.es");
  });

  it("sin correo del visitante no hay Reply-To que apuntar a nadie", () => {
    const payload = buildNotification({ ...base, sender: { name: "Ana" } });
    expect(payload.replyTo).toBeUndefined();
    expect(payload.html).not.toContain("Responde a este correo");
  });

  it("usa las etiquetas visibles, no las claves internas", () => {
    const html = buildNotification(base).html;
    expect(html).toContain("Nombre");
    expect(html).toContain("Mensaje");
    expect(html).not.toContain("<th align=\"left\" style=\"padding:4px 16px 4px 0;vertical-align:top;white-space:nowrap\">nombre<");
  });

  it("omite los campos que el visitante dejó vacíos", () => {
    expect(buildNotification(base).html).not.toContain("Teléfono");
  });

  it("respeta los saltos de línea del mensaje", () => {
    expect(buildNotification(base).html).toContain("baño.<br/>Llamadme");
  });

  it("escapa lo que escribe el visitante: es texto de un extraño en un correo ajeno", () => {
    const payload = buildNotification({
      ...base,
      values: { nombre: '<img src=x onerror="alert(1)">', mensaje: "a & b < c" },
      sender: { name: '"><script>alert(1)</script>', email: "x@y.es" },
    });
    expect(payload.html).not.toContain("<img src=x");
    expect(payload.html).not.toContain("<script>");
    expect(payload.html).toContain("&lt;img src=x");
    expect(payload.html).toContain("a &amp; b &lt; c");
  });

  it("escapa también la URL de la página, que va dentro de un href", () => {
    const payload = buildNotification({
      ...base,
      pageUrl: 'https://x.test/"><script>alert(1)</script>',
    });
    expect(payload.html).not.toContain("<script>");
  });

  it("incluye el consentimiento aceptado, para poder demostrar qué se aceptó", () => {
    const payload = buildNotification({ ...base, consentText: "Acepto la política de privacidad." });
    expect(payload.html).toContain("Acepto la política de privacidad.");
    expect(payload.text).toContain("Acepto la política de privacidad.");
  });

  it("lleva versión en texto plano, para los clientes que no pintan HTML", () => {
    const text = buildNotification(base).text!;
    expect(text).toContain("Nombre: Ana Ruiz");
    expect(text).toContain("https://reformas.test/contacto");
  });
});
