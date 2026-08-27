import { describe, it, expect } from "vitest";
import {
  cleanProposal,
  checkProposal,
  descriptionPrompt,
  altPrompt,
  siteBlurb,
  extractPageText,
  needsHint,
  DESCRIPTION_LIMITS,
  ALT_LIMITS,
} from "./ai-tasks";

const site = {
  siteName: "Reformas Ruiz",
  tagline: "Reformas integrales en Madrid",
  activity: "Reformas Ruiz S.L.",
  otherPages: [
    { title: "Contacto", path: "/contacto" },
    { title: "Sobre nosotros", path: "/sobre-nosotros" },
  ],
};

describe("cleanProposal", () => {
  it("quita las comillas con las que el modelo envuelve la respuesta", () => {
    expect(cleanProposal('"Reformamos tu baño en dos semanas."')).toBe("Reformamos tu baño en dos semanas.");
    expect(cleanProposal("«Reformamos tu baño»")).toBe("Reformamos tu baño");
    expect(cleanProposal("“Reformamos tu baño”")).toBe("Reformamos tu baño");
  });

  it("no quita una comilla que es parte de la frase", () => {
    expect(cleanProposal('Lo que llaman "reforma integral", explicado')).toBe(
      'Lo que llaman "reforma integral", explicado'
    );
  });

  it("quita los prefijos que añade aunque le digas que no", () => {
    expect(cleanProposal("Meta descripción: Reformas de baño en Madrid")).toBe("Reformas de baño en Madrid");
    expect(cleanProposal("Alt: Equipo en el taller")).toBe("Equipo en el taller");
    expect(cleanProposal("Respuesta: Hola")).toBe("Hola");
  });

  it("se queda con el primer párrafo cuando el modelo se explica de más", () => {
    expect(cleanProposal("Reformamos tu baño.\n\nHe elegido esta frase porque…")).toBe("Reformamos tu baño.");
  });

  it("aplasta los saltos de línea sueltos y los espacios dobles", () => {
    expect(cleanProposal("Reformas de baño\nen Madrid  desde  1998")).toBe("Reformas de baño en Madrid desde 1998");
  });

  it("no lanza con basura", () => {
    for (const value of [null, undefined, 42, {}, ""]) {
      expect(cleanProposal(value)).toBe("");
    }
  });
});

describe("checkProposal", () => {
  const ok = "Reformamos baños completos en Madrid en dos semanas, con precio cerrado por contrato.";

  it("acepta una descripción con la longitud correcta", () => {
    const result = checkProposal(ok, DESCRIPTION_LIMITS);
    expect(result.errors).toEqual([]);
    expect(result.declined).toBe(false);
    expect(result.length).toBe(ok.length);
  });

  it("bloquea una que se pasa del máximo", () => {
    const result = checkProposal("x".repeat(200), DESCRIPTION_LIMITS);
    expect(result.errors[0]).toContain("máximo");
  });

  it("avisa sin bloquear cuando pasa de lo ideal pero cabe", () => {
    const result = checkProposal("x".repeat(160), DESCRIPTION_LIMITS);
    expect(result.errors).toEqual([]);
    expect(result.warnings[0]).toContain("cortado");
  });

  it("avisa cuando se queda corta", () => {
    expect(checkProposal("Reformas", DESCRIPTION_LIMITS).warnings[0]).toContain("corto");
  });

  it("avisa de las fórmulas de relleno", () => {
    // «Descubre nuestros servicios» es gramaticalmente correcto y no dice nada.
    for (const filler of [
      "Descubre nuestros servicios de reformas integrales para tu hogar en la ciudad de Madrid",
      "Bienvenido a Reformas Ruiz, tu empresa de confianza para cualquier obra en el hogar hoy",
      "Somos líderes en reformas integrales en la Comunidad de Madrid desde hace muchos años ya",
    ]) {
      expect(checkProposal(filler, DESCRIPTION_LIMITS).warnings.join(" "), filler).toContain("relleno");
    }
  });

  it("«Imagen de» se marca como relleno en un alt", () => {
    expect(checkProposal("Imagen de un baño reformado", ALT_LIMITS).warnings.join(" ")).toContain("relleno");
    expect(checkProposal("Foto de un baño reformado", ALT_LIMITS).warnings.join(" ")).toContain("relleno");
  });

  it("NO_SE_PUEDE se trata como que el modelo se ha negado, no como error", () => {
    // Es la respuesta correcta para «IMG_4821.jpg» sin más contexto.
    const result = checkProposal("NO_SE_PUEDE", ALT_LIMITS);
    expect(result.declined).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.value).toBe("");
  });

  it("bloquea una respuesta que repite la instrucción", () => {
    // Guardarla pondría la instrucción en la página.
    const result = checkProposal("Responde únicamente con la frase, sin prefijos", DESCRIPTION_LIMITS);
    expect(result.errors.join(" ")).toContain("instrucción");
  });

  it("bloquea una respuesta vacía", () => {
    expect(checkProposal("", DESCRIPTION_LIMITS).errors[0]).toContain("no ha devuelto nada");
  });

  it("los límites de alt son más cortos que los de descripción", () => {
    expect(ALT_LIMITS.max).toBeLessThan(DESCRIPTION_LIMITS.max);
  });
});

describe("los prompts", () => {
  it("el contexto del sitio va siempre: sin él el texto es intercambiable", () => {
    const blurb = siteBlurb(site);
    expect(blurb).toContain("Reformas Ruiz");
    expect(blurb).toContain("Reformas integrales en Madrid");
    expect(blurb).toContain("/contacto");
  });

  it("una descripción incluye el contenido real de la página", () => {
    const { prompt } = descriptionPrompt(site, {
      id: "n1", path: "/banos", title: "Baños",
      content: "Reformamos el baño completo en dos semanas con precio cerrado.",
      siblings: [],
    });
    expect(prompt).toContain("Reformamos el baño completo");
    expect(prompt).toContain("/banos");
  });

  it("y las descripciones que ya existen, para que no salgan nueve variaciones de una", () => {
    const { prompt } = descriptionPrompt(site, {
      id: "n1", path: "/banos", title: "Baños", content: "x".repeat(50),
      siblings: ["Cocinas a medida en Madrid", "Presupuesto en 24 horas"],
    });
    expect(prompt).toContain("Escribe una distinta");
    expect(prompt).toContain("Cocinas a medida en Madrid");
  });

  it("una página sin texto lo dice, en vez de mandar un prompt vacío", () => {
    const { prompt } = descriptionPrompt(site, {
      id: "n1", path: "/x", title: "Servicios", content: "", siblings: [],
    });
    expect(prompt).toContain("no tiene texto todavía");
  });

  it("el contenido largo se recorta, para no gastar el prompt en repetirse", () => {
    const { prompt } = descriptionPrompt(site, {
      id: "n1", path: "/x", title: "X", content: "y".repeat(5000), siblings: [],
    });
    expect(prompt.length).toBeLessThan(2600);
  });

  it("el prompt de alt pide negarse cuando el nombre no dice nada", () => {
    const { system, prompt } = altPrompt(site, {
      id: "m1", filename: "IMG_4821.jpg", url: "https://x/y.jpg", usedOn: [],
    });
    expect(system).toContain("NO_SE_PUEDE");
    expect(prompt).toContain("IMG_4821.jpg");
    expect(prompt).toContain("NO_SE_PUEDE");
  });

  it("y dice dónde se usa la imagen, que cambia el alt", () => {
    const { prompt } = altPrompt(site, {
      id: "m1", filename: "equipo.jpg", url: "https://x/y.jpg", usedOn: ["/sobre-nosotros"],
    });
    expect(prompt).toContain("/sobre-nosotros");
  });
});

describe("extractPageText", () => {
  it("saca el texto visible de unos campos con bloques", () => {
    const fields = {
      bloques: [
        { type: "hero", data: { title: "Reformas de baño en Madrid", cta_url: "/contacto" } },
        { type: "prose", data: { body: "<p>Trabajamos con <strong>precio cerrado</strong>.</p>" } },
      ],
    };
    const text = extractPageText(fields);
    expect(text).toContain("Reformas de baño en Madrid");
    expect(text).toContain("Trabajamos con precio cerrado");
    expect(text).not.toContain("<p>");
  });

  it("descarta lo que no es prosa: URLs, ids y ajustes de una palabra", () => {
    const text = extractPageText({
      image: "https://media.test/site/media_abc.jpg",
      parent: "node_abcdef123",
      align: "centro",
      body: "Este sí es un texto de verdad para la página.",
    });
    expect(text).toBe("Este sí es un texto de verdad para la página.");
  });

  it("no lanza ni se cuelga con anidamiento absurdo", () => {
    let deep: any = { body: "Un texto suficientemente largo para contar." };
    for (let i = 0; i < 100; i++) deep = { inner: deep };
    expect(() => extractPageText(deep)).not.toThrow();
  });

  it("no lanza con basura", () => {
    expect(extractPageText(null)).toBe("");
    expect(extractPageText(42)).toBe("");
  });
});

describe("el centinela de negativa", () => {
  it("se reconoce con puntuación, que es como lo devuelve un modelo de verdad", () => {
    // Dicho «responde exactamente NO_SE_PUEDE», responde «NO_SE_PUEDE.» — y con una comparación
    // exacta el centinela se guardaba como una descripción de doce caracteres.
    for (const raw of [
      "NO_SE_PUEDE",
      "NO_SE_PUEDE.",
      "no_se_puede",
      "NO SE PUEDE",
      "NO-SE-PUEDE",
      '"NO_SE_PUEDE"',
      "«NO_SE_PUEDE»",
      "  NO_SE_PUEDE!  ",
    ]) {
      expect(checkProposal(raw, ALT_LIMITS).declined, JSON.stringify(raw)).toBe(true);
    }
  });

  it("una frase que sólo menciona la fórmula no cuenta como negativa", () => {
    const result = checkProposal("No se puede reformar un baño en un día", ALT_LIMITS);
    expect(result.declined).toBe(false);
  });
});

describe("needsHint", () => {
  it("una página sin texto necesita una pista de una persona", () => {
    expect(needsHint({ content: "" })).toBe(true);
    expect(needsHint({ content: "   " })).toBe(true);
    expect(needsHint({ content: "Blog" })).toBe(true);
  });

  it("con texto suficiente no la necesita", () => {
    expect(needsHint({ content: "Reformamos baños completos en Madrid con precio cerrado." })).toBe(false);
  });
});

describe("la pista de una persona", () => {
  it("sustituye al aviso de «no inventes», en vez de sumarse a él", () => {
    // Con los dos en el prompt, el modelo lee el aviso como la instrucción más fuerte y se
    // niega aunque una persona acabe de decirle la respuesta. Visto en la primera llamada real.
    const { prompt } = descriptionPrompt(site, {
      id: "n1", path: "/blog", title: "Blog", content: "", siblings: [],
      hint: "Es el blog de un CMS para agencias",
    });
    expect(prompt).toContain("Es el blog de un CMS para agencias");
    expect(prompt).not.toContain("NO_SE_PUEDE");
    expect(prompt).not.toContain("NO inventes de qué trata el sitio");
  });

  it("sin pista y sin texto, sigue negándose antes que inventar", () => {
    const { prompt } = descriptionPrompt(site, {
      id: "n1", path: "/blog", title: "Blog", content: "", siblings: [],
    });
    expect(prompt).toContain("NO_SE_PUEDE");
  });

  it("con texto propio la pista no hace falta y no se usa", () => {
    const { prompt } = descriptionPrompt(site, {
      id: "n1", path: "/x", title: "X",
      content: "Reformamos baños completos en Madrid con precio cerrado por contrato.",
      siblings: [], hint: "no debería aparecer",
    });
    expect(prompt).toContain("Reformamos baños completos");
    expect(prompt).not.toContain("no debería aparecer");
  });
});
