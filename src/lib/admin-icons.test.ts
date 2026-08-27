import { describe, it, expect } from "vitest";
import { ADMIN_ICONS } from "./admin-icons";

describe("ADMIN_ICONS", () => {
  it("todo icono tiene un path que dibuja algo", () => {
    // Un path vacío se renderiza como un icono invisible, y en el hueco de un enlace de la
    // barra eso parece un fallo de carga.
    for (const [name, path] of Object.entries(ADMIN_ICONS)) {
      expect(path.length, name).toBeGreaterThan(10);
      expect(path, name).toMatch(/^M/);
    }
  });

  it("los path son datos SVG válidos: sólo comandos y números", () => {
    for (const [name, path] of Object.entries(ADMIN_ICONS)) {
      expect(path, name).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/);
    }
  });

  it("ningún path se repite: dos enlaces con el mismo icono es un error de copia", () => {
    const paths = Object.values(ADMIN_ICONS);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("están los que usa la barra", () => {
    for (const name of [
      "dashboard", "content", "media", "menu", "inbox", "types",
      "users", "permissions", "settings", "token", "external", "sun", "moon", "logout",
    ]) {
      expect(ADMIN_ICONS, name).toHaveProperty(name);
    }
  });
});
