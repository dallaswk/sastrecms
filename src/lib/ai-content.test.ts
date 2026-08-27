import { describe, it, expect } from "vitest";
import {
  extractJsonArray,
  checkBlocks,
  summariseBlocks,
  contentPrompt,
  sectionCatalogue,
  issuesAsInstruction,
  CONTENT_SECTIONS,
  MIN_BLOCKS,
  MAX_BLOCKS,
} from "./ai-content";
import { SECTIONS } from "@lib/sections/registry";

let counter = 0;
const makeId = () => `sec_test_${++counter}`;

const site = {
  siteName: "Reformas Ruiz",
  tagline: "Reformas integrales en Madrid",
  otherPages: [{ title: "Contacto", path: "/contacto" }],
};

describe("extractJsonArray", () => {
  const array = '[{"type":"hero","data":{"title":"Hola"}}]';

  it("lee un array limpio", () => {
    const result = extractJsonArray(array);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it("saca el JSON de un bloque ```json, que es como lo devuelve casi siempre", () => {
    for (const wrapped of [
      "```json\n" + array + "\n```",
      "```\n" + array + "\n```",
      "```javascript\n" + array + "\n```",
    ]) {
      expect(extractJsonArray(wrapped).ok, wrapped.slice(0, 14)).toBe(true);
    }
  });

  it("ignora la prosa de antes y de después", () => {
    const result = extractJsonArray(`Aquí tienes la página:\n${array}\nEspero que te sirva.`);
    expect(result.ok).toBe(true);
  });

  it("no se come corchetes de la prosa posterior", () => {
    // Coger hasta el último ] de la cadena rompería con un comentario que lleve corchetes.
    const result = extractJsonArray(`${array}\n\nNota: revisa el bloque [1] antes de publicar.`);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it("no confunde un corchete dentro de una cadena con el cierre del array", () => {
    const tricky = '[{"type":"prose","data":{"body":"Ver el apartado [3] del contrato"}}]';
    const result = extractJsonArray(tricky);
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.value[0] as any).data.body).toContain("[3]");
  });

  it("envuelve un objeto suelto, que es lo que devuelve al pedirle una lista de uno", () => {
    const result = extractJsonArray('{"type":"hero","data":{"title":"Hola"}}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it("dice que el JSON está cortado en vez de fallar con un error de sintaxis", () => {
    const result = extractJsonArray('[{"type":"hero","data":{"title":"Ho');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("cortado");
  });

  it("no lanza con basura", () => {
    for (const value of [null, undefined, 42, "", "   ", "sin json aquí"]) {
      expect(extractJsonArray(value).ok, String(value)).toBe(false);
    }
  });
});

describe("checkBlocks", () => {
  it("acepta bloques bien formados", () => {
    const { blocks, issues } = checkBlocks(
      [
        { type: "hero", data: { title: "Reformamos tu baño", subtitle: "En dos semanas" } },
        { type: "cta", data: { title: "¿Hablamos?", button_label: "Escríbenos", button_url: "/contacto" } },
      ],
      makeId
    );
    expect(blocks).toHaveLength(2);
    expect(issues).toEqual([]);
    expect(blocks[0]!.id).toMatch(/^sec_test_/);
    expect(blocks[0]!.v).toBe(SECTIONS.hero!.version);
  });

  it("descarta una clave inventada Y LO DICE", () => {
    // Descartarla en silencio es exactamente cómo el MCP devolvía éxito para un hero sin botón.
    const { blocks, issues } = checkBlocks(
      [{ type: "hero", data: { title: "Hola", button_label: "Pulsa" } }],
      makeId
    );
    expect(blocks).toHaveLength(1);
    expect(issues[0]!.message).toContain("button_label");
    expect(blocks[0]!.data).not.toHaveProperty("button_label");
  });

  it("rechaza un tipo que no existe", () => {
    const { blocks, issues } = checkBlocks([{ type: "carrusel_mágico", data: {} }], makeId);
    expect(blocks).toEqual([]);
    expect(issues[0]!.message).toContain("No existe");
  });

  it("rechaza una sección real que no se puede inventar", () => {
    // Una galería necesita imágenes que existan; unos precios, precios de verdad.
    for (const type of ["gallery", "pricing", "team", "logos", "collection"]) {
      const { blocks, issues } = checkBlocks([{ type, data: {} }], makeId);
      expect(blocks, type).toEqual([]);
      expect(issues[0]!.message, type).toContain("no se puede");
    }
  });

  it("rellena con los valores por defecto lo que el modelo omite", () => {
    const { blocks } = checkBlocks([{ type: "hero", data: { title: "Hola" } }], makeId);
    expect(blocks[0]!.data).toHaveProperty("align");
  });

  it("un bloque malo no tira los buenos", () => {
    const { blocks, issues } = checkBlocks(
      [
        { type: "hero", data: { title: "Bueno" } },
        { type: "inventado", data: {} },
        { type: "prose", data: { title: "También bueno", body: "<p>Con cuerpo.</p>" } },
      ],
      makeId
    );
    expect(blocks).toHaveLength(2);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.index).toBe(1);
  });

  it("un bloque sin su campo obligatorio se rechaza y se dice cuál falta", () => {
    // `prose` sin `body` es un bloque que se pintaría vacío.
    const { blocks, issues } = checkBlocks([{ type: "prose", data: { title: "Sólo titular" } }], makeId);
    expect(blocks).toEqual([]);
    expect(issues[0]!.message).toContain("body");
  });

  it("no lanza con basura dentro de la lista", () => {
    const { blocks, issues } = checkBlocks([null, 42, "hola", [], {}], makeId);
    expect(blocks).toEqual([]);
    expect(issues).toHaveLength(5);
  });
});

describe("summariseBlocks", () => {
  it("reduce cada bloque a su tipo y su texto más humano", () => {
    const { blocks } = checkBlocks(
      [
        { type: "hero", data: { title: "Reformamos tu baño en dos semanas" } },
        { type: "prose", data: { body: "<p>Trabajamos con <strong>precio cerrado</strong>.</p>" } },
      ],
      makeId
    );
    const summary = summariseBlocks(blocks);
    expect(summary[0]!.text).toContain("Reformamos tu baño");
    // Las etiquetas HTML no ayudan a decidir si el texto es el correcto.
    expect(summary[1]!.text).toBe("Trabajamos con precio cerrado.");
  });

  it("un repetidor dice cuántos ítems trae, que informa más que el primero", () => {
    const { blocks } = checkBlocks(
      [{ type: "features", data: { title: "Por qué nosotros", items: [{ title: "a" }, { title: "b" }] } }],
      makeId
    );
    expect(summariseBlocks(blocks)[0]!.text).toContain("2 ítem(s)");
  });

  it("no lanza con un bloque sin texto", () => {
    const { blocks } = checkBlocks([{ type: "hero", data: { title: "x" } }], makeId);
    expect(() => summariseBlocks(blocks)).not.toThrow();
  });
});

describe("el prompt", () => {
  const page = { title: "Reformas de baño", path: "/banos", hint: "Reformamos baños completos" };

  it("lleva la pista de la persona, que aquí es obligatoria", () => {
    expect(contentPrompt(site, page).prompt).toContain("Reformamos baños completos");
  });

  it("lista las rutas que existen, para que el CTA no enlace a una inventada", () => {
    const { prompt } = contentPrompt(site, page);
    expect(prompt).toContain("/contacto");
    expect(prompt).toContain("No enlaces a ninguna ruta que no esté");
  });

  it("el catálogo trae las claves reales de cada sección", () => {
    const catalogue = sectionCatalogue();
    // La clave de verdad del hero, la que el modelo se inventó como button_label.
    expect(catalogue).toContain("cta_label");
    expect(catalogue).toContain("hero");
  });

  it("el catálogo sólo ofrece lo que se puede inventar", () => {
    const catalogue = sectionCatalogue();
    for (const excluded of ["gallery", "pricing", "team", "logos", "collection", "contact", "legal"]) {
      expect(catalogue.split("\n").some((line) => line.startsWith(excluded)), excluded).toBe(false);
    }
  });

  it("cada sección ofrecida existe en el registro", () => {
    for (const type of CONTENT_SECTIONS) {
      expect(SECTIONS, type).toHaveProperty(type);
    }
  });

  it("el sistema pide un rango de bloques coherente", () => {
    const { system } = contentPrompt(site, page);
    expect(system).toContain(String(MIN_BLOCKS));
    expect(system).toContain(String(MAX_BLOCKS));
    expect(MIN_BLOCKS).toBeLessThan(MAX_BLOCKS);
  });

  it("prohíbe inventarse datos, que es el riesgo real a este volumen", () => {
    expect(contentPrompt(site, page).system).toContain("No inventes datos");
  });
});

describe("issuesAsInstruction", () => {
  it("convierte los problemas en un reintento distinto, no en el mismo", () => {
    const instruction = issuesAsInstruction([
      { index: 0, type: "hero", message: "Claves que no existen: button_label." },
    ]);
    expect(instruction).toContain("bloque 1");
    expect(instruction).toContain("button_label");
  });

  it("sin problemas no genera instrucción", () => {
    expect(issuesAsInstruction([])).toBe("");
  });
});
