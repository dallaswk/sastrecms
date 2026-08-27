import { describe, it, expect } from "vitest";
import { PRESETS, listPresets, getPreset } from "./registry";
import { SECTIONS } from "@lib/sections/registry";
import { parseSections } from "@lib/sections/validate";
import { FIELD_TYPES } from "@lib/fields/types";
import { MENU_KEYS } from "@lib/menus";

/**
 * A preset is applied once, at the start of a project, and whatever it gets wrong ends up
 * looking like a CMS bug three days later. A typo in a section type would produce an
 * empty page in silence, so these run over every declaration.
 */
describe("invariantes de los presets", () => {
  const presets = listPresets();

  it("hay al menos uno y cada uno se registra bajo su clave", () => {
    expect(presets.length).toBeGreaterThan(0);
    for (const [key, preset] of Object.entries(PRESETS)) expect(preset.key).toBe(key);
  });

  it.each(presets.map((p) => [p.key, p] as const))("%s: metadatos completos", (_key, preset) => {
    expect(preset.label.trim()).toBeTruthy();
    // La descripción la lee quien elige en el asistente: una línea vacía no ayuda.
    expect(preset.description.length).toBeGreaterThan(30);
    expect(preset.theme.primaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it.each(presets.map((p) => [p.key, p] as const))("%s: sólo usa secciones que existen", (_key, preset) => {
    for (const page of preset.pages) {
      for (const section of page.sections ?? []) {
        expect(SECTIONS, `${page.slug} usa "${section.type}"`).toHaveProperty(section.type);
      }
    }
  });

  it.each(presets.map((p) => [p.key, p] as const))("%s: sus secciones pasan la validación real", (_key, preset) => {
    // El mismo parseSections que corre en servidor. Si un preset trae un campo requerido
    // vacío, el sitio nace con un error el primer día.
    for (const page of preset.pages) {
      if (!page.sections?.length) continue;
      const { errors } = parseSections(page.sections.map((s) => ({ ...s, v: SECTIONS[s.type]?.version ?? 1 })));
      expect(errors, `${page.slug}: ${errors.map((e) => e.message).join(" · ")}`).toEqual([]);
    }
  });

  it.each(presets.map((p) => [p.key, p] as const))("%s: los slugs no se repiten", (_key, preset) => {
    const slugs = preset.pages.map((p) => p.slug);
    expect(new Set(slugs).size, `slugs repetidos en ${_key}`).toBe(slugs.length);
  });

  it.each(presets.map((p) => [p.key, p] as const))("%s: cada padre se declara antes que su hijo", (_key, preset) => {
    // Se aplican en orden, así que un hijo antes que su padre no encontraría dónde colgar.
    const seen = new Set<string>();
    for (const page of preset.pages) {
      if (page.parentSlug) expect(seen, `${page.slug} cuelga de ${page.parentSlug}`).toContain(page.parentSlug);
      seen.add(page.slug);
    }
  });

  it.each(presets.map((p) => [p.key, p] as const))("%s: los menús apuntan a páginas que crea", (_key, preset) => {
    const slugs = new Set(preset.pages.map((p) => p.slug));
    for (const key of MENU_KEYS) {
      for (const item of preset.menus[key] ?? []) {
        expect(item.label.trim()).toBeTruthy();
        if (item.slug) expect(slugs, `menú ${key} → "${item.slug}"`).toContain(item.slug);
        else expect(item.url, `menú ${key}: "${item.label}" sin destino`).toBeTruthy();
      }
    }
  });

  it.each(presets.map((p) => [p.key, p] as const))("%s: sus tipos de contenido son válidos", (_key, preset) => {
    for (const ct of preset.contentTypes ?? []) {
      expect(ct.key).toMatch(/^[a-z][a-z0-9_]*$/);
      const keys = ct.fieldSchema.map((f) => f.key);
      expect(new Set(keys).size, `${ct.key} repite claves`).toBe(keys.length);
      for (const f of ct.fieldSchema) expect(FIELD_TYPES, `${ct.key}.${f.key}`).toContain(f.type);
    }
  });

  it.each(presets.map((p) => [p.key, p] as const))("%s: incluye las tres páginas legales", (_key, preset) => {
    // Son obligatorias en España, y olvidarlas en el preset significa olvidarlas siempre.
    const slugs = new Set(preset.pages.map((p) => p.slug));
    for (const legal of ["aviso-legal", "politica-de-privacidad", "politica-de-cookies"]) {
      expect(slugs, `falta ${legal}`).toContain(legal);
    }
  });

  it.each(presets.map((p) => [p.key, p] as const))("%s: tiene portada", (_key, preset) => {
    expect(preset.pages.map((p) => p.slug)).toContain("index");
  });
});

describe("getPreset", () => {
  it("devuelve undefined para una clave inventada, sin lanzar", () => {
    expect(getPreset("peluqueria-espacial")).toBeUndefined();
  });
});
