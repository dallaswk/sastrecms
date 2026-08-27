import { describe, it, expect } from "vitest";
import {
  emptyState,
  addToast,
  removeToast,
  clearToasts,
  politeness,
  roleFor,
  displayMessage,
  messageFrom,
  DEFAULT_DURATIONS,
  MAX_VISIBLE,
  TOAST_KINDS,
} from "./toast";

describe("addToast", () => {
  it("añade con id incremental", () => {
    let state = emptyState();
    state = addToast(state, { kind: "success", message: "a" }).state;
    state = addToast(state, { kind: "info", message: "b" }).state;
    expect(state.toasts.map((t) => t.id)).toEqual([1, 2]);
  });

  it("agrupa el mensaje idéntico repetido en vez de apilar veinte copias", () => {
    // Marcar veinte mensajes como leídos dispara veinte toasts iguales.
    let state = emptyState();
    for (let i = 0; i < 20; i++) {
      state = addToast(state, { kind: "success", message: "Mensaje actualizado" }).state;
    }
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0]!.count).toBe(20);
  });

  it("sólo agrupa con el último: dos guardados separados son dos eventos", () => {
    let state = emptyState();
    state = addToast(state, { kind: "success", message: "Guardado" }).state;
    state = addToast(state, { kind: "info", message: "Otra cosa" }).state;
    state = addToast(state, { kind: "success", message: "Guardado" }).state;
    expect(state.toasts).toHaveLength(3);
    expect(state.toasts.every((t) => t.count === 1)).toBe(true);
  });

  it("no agrupa uno con acción: perdería el botón", () => {
    let state = emptyState();
    const input = { kind: "success" as const, message: "Borrado", action: { label: "Deshacer", id: "undo" } };
    state = addToast(state, input).state;
    state = addToast(state, input).state;
    expect(state.toasts).toHaveLength(2);
  });

  it("al pasarse del tope tira el más antiguo, no el más nuevo", () => {
    // Lo que acaba de pasar es lo que la persona está esperando ver.
    let state = emptyState();
    for (let i = 0; i < MAX_VISIBLE + 3; i++) {
      state = addToast(state, { kind: "info", message: `n${i}` }).state;
    }
    expect(state.toasts).toHaveLength(MAX_VISIBLE);
    expect(state.toasts[state.toasts.length - 1]!.message).toBe(`n${MAX_VISIBLE + 2}`);
    expect(state.toasts.some((t) => t.message === "n0")).toBe(false);
  });

  it("un error no se va solo", () => {
    // Un error de cuatro segundos es un error que nadie leyó.
    const { toast } = addToast(emptyState(), { kind: "error", message: "Falló" });
    expect(toast.duration).toBe(0);
    expect(DEFAULT_DURATIONS.error).toBe(0);
  });

  it("los demás sí, y el aviso dura más que la confirmación", () => {
    expect(DEFAULT_DURATIONS.success).toBeGreaterThan(0);
    expect(DEFAULT_DURATIONS.warning).toBeGreaterThan(DEFAULT_DURATIONS.success);
  });

  it("una duración explícita gana", () => {
    const { toast } = addToast(emptyState(), { kind: "error", message: "x", duration: 1000 });
    expect(toast.duration).toBe(1000);
  });

  it("cada tipo tiene duración por defecto", () => {
    for (const kind of TOAST_KINDS) {
      expect(DEFAULT_DURATIONS[kind], kind).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("removeToast / clearToasts", () => {
  it("quita sólo el que se le dice", () => {
    let state = emptyState();
    state = addToast(state, { kind: "info", message: "a" }).state;
    state = addToast(state, { kind: "info", message: "b" }).state;
    state = removeToast(state, 1);
    expect(state.toasts.map((t) => t.message)).toEqual(["b"]);
  });

  it("quitar uno que no existe no lanza ni cambia nada", () => {
    const state = addToast(emptyState(), { kind: "info", message: "a" }).state;
    expect(removeToast(state, 99).toasts).toHaveLength(1);
  });

  it("los ids no se reutilizan al vaciar, o un temporizador viejo cerraría el nuevo", () => {
    let state = addToast(emptyState(), { kind: "info", message: "a" }).state;
    state = clearToasts(state);
    const { toast } = addToast(state, { kind: "info", message: "b" });
    expect(toast.id).toBe(2);
  });
});

describe("accesibilidad", () => {
  it("un error interrumpe al lector de pantalla; una confirmación no", () => {
    // Anunciar «Guardado» encima de lo que alguien está leyendo es peor que anunciarlo luego.
    expect(politeness("error")).toBe("assertive");
    expect(roleFor("error")).toBe("alert");
    for (const kind of ["success", "info", "warning"] as const) {
      expect(politeness(kind), kind).toBe("polite");
      expect(roleFor(kind), kind).toBe("status");
    }
  });
});

describe("displayMessage", () => {
  it("uno solo sale tal cual", () => {
    const { toast } = addToast(emptyState(), { kind: "info", message: "Hecho" });
    expect(displayMessage(toast)).toBe("Hecho");
  });

  it("agrupado lo dice, en vez de aparecer varias veces", () => {
    let state = emptyState();
    state = addToast(state, { kind: "info", message: "Hecho" }).state;
    const { toast } = addToast(state, { kind: "info", message: "Hecho" });
    expect(displayMessage(toast)).toBe("Hecho (×2)");
  });
});

describe("messageFrom", () => {
  it("una cadena, un Error y un error de acción", () => {
    expect(messageFrom("Falta el título")).toBe("Falta el título");
    expect(messageFrom(new Error("Boom"))).toBe("Boom");
    expect(messageFrom({ message: "Forbidden: se requiere admin" })).toBe("Forbidden: se requiere admin");
  });

  it("nunca devuelve [object Object] ni una cadena vacía", () => {
    // Un toast que dice «[object Object]» es peor que ninguno: parece que el sistema sabe
    // algo que no va a contar.
    for (const value of [null, undefined, {}, 42, [], "   ", { message: "" }]) {
      const result = messageFrom(value);
      expect(result, JSON.stringify(value)).toBe("Algo ha fallado.");
    }
  });

  it("admite un texto de reserva propio", () => {
    expect(messageFrom(null, "No se pudo publicar.")).toBe("No se pudo publicar.");
  });
});
