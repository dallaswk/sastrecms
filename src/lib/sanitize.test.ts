import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizeFields } from "./sanitize";

describe("sanitizeHtml: lo que ultrahtml dejaba pasar", () => {
  it("quita los manejadores de eventos", () => {
    // El transformador de ultrahtml los conserva. Verificado ejecutándolo, no leyendo docs.
    expect(sanitizeHtml('<p onclick="alert(1)">hola</p>')).toBe("<p>hola</p>");
    expect(sanitizeHtml('<a href="/x" onmouseover="y">z</a>')).toBe('<a href="/x">z</a>');
    expect(sanitizeHtml('<img src="/a.jpg" onerror="alert(1)">')).toBe('<img src="/a.jpg">');
  });

  it("quita cualquier atributo que empiece por on, no una lista concreta", () => {
    expect(sanitizeHtml('<p onanimationstart="x" onbeforetoggle="y">t</p>')).toBe("<p>t</p>");
  });

  it("rechaza javascript: en href", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="JaVaScRiPt:alert(1)">x</a>')).toBe("<a>x</a>");
  });

  it("rechaza javascript: partido con caracteres de control, que es el truco clásico", () => {
    // Escapes explícitos: un carácter de control literal en el fuente es una mina.
    const TAB = String.fromCharCode(9);
    const LF = String.fromCharCode(10);
    const NUL = String.fromCharCode(0);
    for (const gap of [TAB, LF, NUL, " ", TAB + LF]) {
      expect(sanitizeHtml(`<a href="java${gap}script:alert(1)">x</a>`), JSON.stringify(gap)).toBe(
        "<a>x</a>"
      );
    }
    expect(sanitizeHtml('<a href="  javascript:alert(1)">x</a>')).toBe("<a>x</a>");
  });

  it("rechaza data: incluso para imágenes", () => {
    // Un SVG es un documento y puede llevar scripts, así que permitir data:image dejaría
    // entrar código por el atributo que todo el mundo da por seguro.
    expect(sanitizeHtml('<img src="data:image/svg+xml;base64,PHN2Zz4=">')).toBe("<img>");
  });

  it("rechaza otros esquemas raros", () => {
    for (const scheme of ["vbscript:msgbox(1)", "file:///etc/passwd", "blob:http://x/y"]) {
      expect(sanitizeHtml(`<a href="${scheme}">x</a>`), scheme).toBe("<a>x</a>");
    }
  });

  it("quita style, que puede tapar la página entera", () => {
    expect(sanitizeHtml('<p style="position:fixed;inset:0">x</p>')).toBe("<p>x</p>");
  });
});

describe("sanitizeHtml: lo que sí debe conservar", () => {
  it("el marcado normal de un editor de texto", () => {
    const input =
      "<h2>Título</h2><p>Un <strong>texto</strong> con <em>énfasis</em>.</p>" +
      "<ul><li>uno</li><li>dos</li></ul><blockquote>cita</blockquote>";
    expect(sanitizeHtml(input)).toBe(input);
  });

  it("enlaces y rutas seguras", () => {
    expect(sanitizeHtml('<a href="https://ejemplo.es">x</a>')).toBe('<a href="https://ejemplo.es">x</a>');
    expect(sanitizeHtml('<a href="/contacto">x</a>')).toBe('<a href="/contacto">x</a>');
    expect(sanitizeHtml('<a href="#precios">x</a>')).toBe('<a href="#precios">x</a>');
    expect(sanitizeHtml('<a href="mailto:a@b.es">x</a>')).toBe('<a href="mailto:a@b.es">x</a>');
    expect(sanitizeHtml('<a href="tel:+34600112233">x</a>')).toBe('<a href="tel:+34600112233">x</a>');
  });

  it("tablas, que es lo que trae un texto pegado de un documento", () => {
    const input = "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>";
    expect(sanitizeHtml(input)).toBe(input);
  });

  it("las clases sobreviven: el editor pinta con ellas", () => {
    expect(sanitizeHtml('<p class="text-lg">x</p>')).toBe('<p class="text-lg">x</p>');
  });
});

describe("sanitizeHtml: cómo descarta", () => {
  it("un envoltorio desconocido pierde la etiqueta y conserva el texto", () => {
    // Tirar el contenido de un <section> pegado de Word borraría el párrafo que importaba.
    expect(sanitizeHtml("<section><p>importante</p></section>")).toBe("<p>importante</p>");
    expect(sanitizeHtml("<custom-el>texto</custom-el>")).toBe("texto");
  });

  it("un script se va con su contenido, no se desenvuelve", () => {
    expect(sanitizeHtml("<script>alert(1)</script>")).toBe("");
    expect(sanitizeHtml("<p>antes</p><script>alert(1)</script><p>después</p>")).toBe(
      "<p>antes</p><p>después</p>"
    );
    expect(sanitizeHtml("<style>body{display:none}</style>")).toBe("");
    expect(sanitizeHtml('<iframe src="https://malo.test"></iframe>')).toBe("");
    expect(sanitizeHtml("<svg><script>alert(1)</script></svg>")).toBe("");
  });

  it("los formularios se van: un formulario inyectado es phishing en tu dominio", () => {
    expect(sanitizeHtml('<form action="https://malo.test"><input name="pass"></form>')).toBe("");
  });

  it("escapa un & suelto, pero no vuelve a escapar una entidad ya correcta", () => {
    // Escapar todo & convertía &amp; en &amp;amp; y el lector veía «&amp;» en la página. Y al
    // no ser idempotente, cada guardado lo empeoraba un poco más.
    expect(sanitizeHtml("<p>Ana & Luis</p>")).toBe("<p>Ana &amp; Luis</p>");
    expect(sanitizeHtml("<p>5 &lt; 7 &amp;&amp; 8 &gt; 2</p>")).toBe("<p>5 &lt; 7 &amp;&amp; 8 &gt; 2</p>");
    expect(sanitizeHtml("<p>Ma&ntilde;ana &#8212; ma&#x00F1;ana</p>")).toBe(
      "<p>Ma&ntilde;ana &#8212; ma&#x00F1;ana</p>"
    );
  });

  it("guardar dos veces no degrada el texto", () => {
    const original = "<p>Ana &amp; Luis, 5 &lt; 7</p>";
    let value = original;
    for (let i = 0; i < 5; i++) value = sanitizeHtml(value);
    expect(value).toBe(original);
  });

  it("escapa las comillas dentro de un atributo", () => {
    expect(sanitizeHtml("<p title='di \"hola\"'>x</p>")).toBe('<p title="di &quot;hola&quot;">x</p>');
  });

  it("los comentarios se van, y con ellos lo que esconden", () => {
    expect(sanitizeHtml("<p>a</p><!-- <script>alert(1)</script> -->")).toBe("<p>a</p>");
  });
});

describe("sanitizeHtml: detalles", () => {
  it("target=_blank sale con rel, o la página abierta puede manipular esta", () => {
    expect(sanitizeHtml('<a href="https://x.es" target="_blank">x</a>')).toBe(
      '<a href="https://x.es" target="_blank" rel="noopener noreferrer">x</a>'
    );
  });

  it("un target que no es _blank se descarta", () => {
    expect(sanitizeHtml('<a href="/x" target="miframe">x</a>')).toBe('<a href="/x">x</a>');
  });

  it("srcset: una sola entrada mala invalida el atributo entero", () => {
    expect(sanitizeHtml('<img src="/a.jpg" srcset="/a.jpg 1x, javascript:x 2x">')).toBe(
      '<img src="/a.jpg">'
    );
    expect(sanitizeHtml('<img src="/a.jpg" srcset="/a.jpg 1x, /b.jpg 2x">')).toBe(
      '<img src="/a.jpg" srcset="/a.jpg 1x, /b.jpg 2x">'
    );
  });

  it("los elementos vacíos no se cierran", () => {
    expect(sanitizeHtml("<p>a<br>b</p>")).toBe("<p>a<br>b</p>");
    expect(sanitizeHtml("<hr>")).toBe("<hr>");
  });

  it("no lanza con basura ni con anidamiento absurdo", () => {
    for (const value of [null, undefined, "", "   ", 42, {}]) {
      expect(sanitizeHtml(value)).toBe("");
    }
    const deep = "<div>".repeat(500) + "hola" + "</div>".repeat(500);
    expect(() => sanitizeHtml(deep)).not.toThrow();
  });

  it("es idempotente: sanear lo ya saneado no lo cambia", () => {
    const once = sanitizeHtml('<p class="x">a <a href="https://y.es" target="_blank">b</a></p>');
    expect(sanitizeHtml(once)).toBe(once);
  });
});

describe("sanitizeFields", () => {
  it("recorre el objeto completo, a cualquier profundidad", () => {
    const fields = {
      title: "Sin etiquetas",
      body: '<p onclick="alert(1)">texto</p>',
      bloques: [
        { id: "s1", data: { body: "<script>alert(1)</script><p>ok</p>" } },
        { id: "s2", data: { items: [{ text: '<a href="javascript:x">y</a>' }] } },
      ],
    };
    const clean = sanitizeFields(fields);
    expect(clean.title).toBe("Sin etiquetas");
    expect(clean.body).toBe("<p>texto</p>");
    expect((clean.bloques[0] as any).data.body).toBe("<p>ok</p>");
    expect((clean.bloques[1] as any).data.items[0].text).toBe("<a>y</a>");
  });

  it("no toca el texto plano, para no convertir un < en entidad sin motivo", () => {
    const fields = { title: "Precio < 100 €", nota: "a & b" };
    expect(sanitizeFields(fields)).toEqual(fields);
  });

  it("conserva los tipos que no son texto", () => {
    const fields = { n: 42, b: true, nada: null, lista: [1, 2] };
    expect(sanitizeFields(fields)).toEqual(fields);
  });

  it("no lanza con anidamiento absurdo", () => {
    let deep: any = { body: '<p onclick="x">y</p>' };
    for (let i = 0; i < 100; i++) deep = { inner: deep };
    expect(() => sanitizeFields(deep)).not.toThrow();
  });
});
