import { describe, it, expect } from "vitest";
import { TOOLS, getTool, listTools, initializeResult, PROTOCOL_VERSION } from "./registry";

describe("el registro de herramientas", () => {
  it("no repite nombres", () => {
    const names = TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("todas las herramientas que existían siguen existiendo", () => {
    // El switch original tenía estas once. Perder una al mover a datos rompería a cualquier
    // agente ya conectado, y en silencio.
    for (const name of [
      "list_content_types", "list_nodes", "get_node", "create_node", "update_node",
      "publish_node", "delete_node", "list_media", "search_content", "get_settings",
      "update_settings",
    ]) {
      expect(getTool(name), name).toBeDefined();
    }
  });

  it("las de autoría por bloques están", () => {
    for (const name of [
      "describe_sections", "describe_content_type", "get_sections", "set_sections",
      "add_section", "patch_section", "move_section", "remove_section",
      "create_page_from_sections", "upload_media",
    ]) {
      expect(getTool(name), name).toBeDefined();
    }
  });

  it("cada herramienta declara descripción, esquema y handler", () => {
    for (const tool of TOOLS) {
      expect(tool.description.length, tool.name).toBeGreaterThan(20);
      expect(tool.inputSchema.type, tool.name).toBe("object");
      expect(typeof tool.handler, tool.name).toBe("function");
    }
  });

  it("todo campo obligatorio del esquema existe entre sus propiedades", () => {
    // Un `required` que nombra un campo inexistente hace que un cliente estricto rechace
    // cualquier llamada a esa herramienta.
    for (const tool of TOOLS) {
      const properties = Object.keys((tool.inputSchema.properties ?? {}) as object);
      for (const field of (tool.inputSchema.required ?? []) as string[]) {
        expect(properties, `${tool.name}.${field}`).toContain(field);
      }
    }
  });

  it("cada propiedad lleva descripción: es lo que lee el modelo al rellenarla", () => {
    for (const tool of TOOLS) {
      for (const [key, schema] of Object.entries((tool.inputSchema.properties ?? {}) as Record<string, any>)) {
        expect(schema.description, `${tool.name}.${key}`).toBeTruthy();
      }
    }
  });

  it("getTool no lanza con un nombre inventado", () => {
    expect(getTool("borra_todo")).toBeUndefined();
  });
});

describe("listTools", () => {
  it("publica exactamente las del registro", () => {
    expect(listTools().map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
  });

  it("marca de sólo lectura las que no escriben, y sólo esas", () => {
    const listed = new Map(listTools().map((t) => [t.name, t]));
    for (const tool of TOOLS) {
      expect(listed.get(tool.name)!.annotations.readOnlyHint, tool.name).toBe(!tool.mutates);
    }
  });

  it("las de lectura no marcan idempotencia de escritura", () => {
    for (const listed of listTools()) {
      if (listed.annotations.readOnlyHint) {
        expect(listed.annotations.idempotentHint).toBe(false);
      }
    }
  });
});

describe("initialize", () => {
  it("declara la versión de protocolo y sólo la capacidad que implementa", () => {
    const result = initializeResult();
    expect(result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(Object.keys(result.capabilities)).toEqual(["tools"]);
    // Anunciar resources o prompts sin implementarlos hace que el cliente los llame y falle.
    expect("resources" in result.capabilities).toBe(false);
    expect("prompts" in result.capabilities).toBe(false);
  });

  it("las instrucciones nombran el camino corto para componer páginas", () => {
    expect(initializeResult().instructions).toContain("describe_sections");
    expect(initializeResult().instructions).toContain("patch_section");
  });
});
