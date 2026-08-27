import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  renderBody,
  renderSubject,
  textToHtml,
  availablePlaceholders,
  type TemplateContext,
} from "./template";
import { parseFormFields } from "./validate";

const fields = parseFormFields([
  { key: "nombre", label: "Nombre", type: "text" },
  { key: "email", label: "Correo", type: "email" },
  { key: "telefono", label: "Teléfono", type: "tel" },
  { key: "mensaje", label: "Mensaje", type: "textarea" },
]);

const context: TemplateContext = {
  fields,
  values: { nombre: "Ana Ruiz", email: "ana@ejemplo.es", mensaje: "Línea uno\nLínea dos" },
  siteName: "Reformas Ruiz",
  pageTitle: "Contacto",
  pageUrl: "https://reformas.test/contacto",
  date: "27 de agosto de 2026, 14:30",
};

describe("renderTemplate", () => {
  it("sustituye los campos por su clave", () => {
    expect(renderTemplate("Hola {{nombre}}", context, "text")).toBe("Hola Ana Ruiz");
  });

  it("tolera espacios dentro de las llaves", () => {
    expect(renderTemplate("Hola {{ nombre }}", context, "text")).toBe("Hola Ana Ruiz");
  });

  it("deja el marcador tal cual si no existe, para que la errata se vea", () => {
    // Blanquearlo produciría "Hola ," y nadie sabría por qué.
    expect(renderTemplate("Hola {{nombe}}", context, "text")).toBe("Hola {{nombe}}");
  });

  it("un campo declarado pero sin rellenar queda vacío, no con el marcador", () => {
    expect(renderTemplate("Tel: {{telefono}}", context, "text")).toBe("Tel: ");
  });

  it("los marcadores internos", () => {
    expect(renderTemplate("{{_sitio}} · {{_pagina}} · {{_fecha}}", context, "text")).toBe(
      "Reformas Ruiz · Contacto · 27 de agosto de 2026, 14:30"
    );
  });

  it("escapa los valores del visitante en modo html", () => {
    const hostile = { ...context, values: { ...context.values, nombre: '<script>alert(1)</script>' } };
    const html = renderTemplate("Hola {{nombre}}", hostile, "html");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("no escapa en modo texto, donde no hay nada que inyectar", () => {
    const hostile = { ...context, values: { ...context.values, nombre: "a & b" } };
    expect(renderTemplate("{{nombre}}", hostile, "text")).toBe("a & b");
  });

  it("{{_respuestas}} sale como tabla en html y como líneas en texto", () => {
    expect(renderTemplate("{{_respuestas}}", context, "html")).toContain("<table");
    expect(renderTemplate("{{_respuestas}}", context, "text")).toBe(
      "Nombre: Ana Ruiz\nCorreo: ana@ejemplo.es\nMensaje: Línea uno\nLínea dos"
    );
  });

  it("la tabla escapa cada respuesta, aunque sea la que no se escapa como bloque", () => {
    const hostile = { ...context, values: { nombre: '<img src=x onerror=alert(1)>' } };
    const html = renderTemplate("{{_respuestas}}", hostile, "html");
    expect(html).toContain("<table");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});

describe("textToHtml", () => {
  it("línea en blanco separa párrafos, salto simple es un <br>", () => {
    expect(textToHtml("Uno\ndos\n\nTres")).toBe("<p>Uno<br/>dos</p><p>Tres</p>");
  });

  it("escapa lo que escribe el dueño del sitio", () => {
    expect(textToHtml("a < b & c")).toBe("<p>a &lt; b &amp; c</p>");
  });

  it("no mete la tabla de respuestas dentro de un <p>, que sería html inválido", () => {
    expect(textToHtml("Hola\n\n{{_respuestas}}")).toBe("<p>Hola</p>{{_respuestas}}");
  });
});

describe("renderBody", () => {
  it("escapa el texto del dueño y el del visitante, cada uno una sola vez", () => {
    const body = renderBody("Nota: a & b\n\nHola {{nombre}}", {
      ...context,
      values: { ...context.values, nombre: "Tom & Jerry" },
    });
    expect(body.html).toContain("a &amp; b");
    expect(body.html).toContain("Tom &amp; Jerry");
    expect(body.html).not.toContain("&amp;amp;");
    expect(body.text).toContain("Tom & Jerry");
  });

  it("la tabla sobrevive como marcado pese a pasar por el escapado", () => {
    const body = renderBody("{{_respuestas}}", context);
    expect(body.html).toContain("<table");
    expect(body.html).not.toContain("&lt;table");
  });
});

describe("renderSubject", () => {
  it("aplasta los saltos de línea: uno en una cabecera es una inyección", () => {
    const hostile = {
      ...context,
      values: { ...context.values, nombre: "Ana\r\nBcc: victima@ejemplo.es" },
    };
    const subject = renderSubject("Consulta de {{nombre}}", hostile);
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject).toContain("Bcc:");
  });

  it("corta un asunto absurdamente largo", () => {
    const long = { ...context, values: { nombre: "x".repeat(500) } };
    expect(renderSubject("{{nombre}}", long).length).toBeLessThanOrEqual(200);
  });
});

describe("availablePlaceholders", () => {
  it("ofrece los campos del formulario y los internos", () => {
    const tokens = availablePlaceholders(fields).map((p) => p.token);
    expect(tokens).toContain("{{nombre}}");
    expect(tokens).toContain("{{_respuestas}}");
  });
});
