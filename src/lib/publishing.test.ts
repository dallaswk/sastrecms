import { describe, it, expect } from "vitest";
import {
  isPubliclyVisible,
  isTrashed,
  nextScheduledAt,
  cacheTtlFor,
  sameInstant,
  checkConflict,
  checkSchedule,
  describeSchedule,
} from "./publishing";

const NOW = new Date("2026-08-27T12:00:00Z");
const at = (iso: string) => new Date(iso);

describe("isPubliclyVisible", () => {
  it("publicado se ve", () => {
    expect(isPubliclyVisible({ status: "published" }, NOW)).toBe(true);
  });

  it("borrador no", () => {
    expect(isPubliclyVisible({ status: "draft" }, NOW)).toBe(false);
  });

  it("programado con la hora pasada se ve, sin que nada lo haya publicado", () => {
    // Esto es la publicación programada sin cron: aparece en la primera visita posterior.
    expect(isPubliclyVisible({ status: "scheduled", publishAt: at("2026-08-27T11:59:00Z") }, NOW)).toBe(true);
  });

  it("programado con la hora futura no", () => {
    expect(isPubliclyVisible({ status: "scheduled", publishAt: at("2026-08-27T12:01:00Z") }, NOW)).toBe(false);
  });

  it("programado sin fecha no se ve: no adivina", () => {
    expect(isPubliclyVisible({ status: "scheduled", publishAt: null }, NOW)).toBe(false);
  });

  it("en la papelera no se ve, aunque esté publicado", () => {
    expect(isPubliclyVisible({ status: "published", deletedAt: at("2026-08-01T00:00:00Z") }, NOW)).toBe(false);
    expect(isTrashed({ deletedAt: at("2026-08-01T00:00:00Z") })).toBe(true);
    expect(isTrashed({ deletedAt: null })).toBe(false);
  });

  it("justo en el instante de publicación ya se ve", () => {
    expect(isPubliclyVisible({ status: "scheduled", publishAt: NOW }, NOW)).toBe(true);
  });
});

describe("nextScheduledAt", () => {
  it("devuelve la más próxima en el futuro", () => {
    const next = nextScheduledAt([
      { status: "scheduled", publishAt: at("2026-08-27T18:00:00Z") },
      { status: "scheduled", publishAt: at("2026-08-27T13:00:00Z") },
      { status: "published" },
    ], NOW);
    expect(next?.toISOString()).toBe("2026-08-27T13:00:00.000Z");
  });

  it("ignora las pasadas, los borradores y la papelera", () => {
    expect(nextScheduledAt([
      { status: "scheduled", publishAt: at("2026-08-27T11:00:00Z") },
      { status: "draft", publishAt: at("2026-08-27T13:00:00Z") },
      { status: "scheduled", publishAt: at("2026-08-27T13:00:00Z"), deletedAt: NOW },
    ], NOW)).toBeNull();
  });

  it("sin nada programado devuelve null", () => {
    expect(nextScheduledAt([{ status: "published" }], NOW)).toBeNull();
    expect(nextScheduledAt([], NOW)).toBeNull();
  });
});

describe("cacheTtlFor", () => {
  it("sin nada programado usa el valor normal", () => {
    expect(cacheTtlFor(3600, NOW, null)).toBe(3600);
  });

  it("acorta la caché para que no sobreviva al momento de publicación", () => {
    // Nada escribe en ese instante, así que nada purga: si la página vive una hora, el post
    // nuevo tarda hasta una hora en aparecer.
    expect(cacheTtlFor(3600, NOW, at("2026-08-27T12:10:00Z"))).toBe(600);
  });

  it("no alarga la caché cuando lo programado está muy lejos", () => {
    expect(cacheTtlFor(3600, NOW, at("2027-01-01T00:00:00Z"))).toBe(3600);
  });

  it("respeta un suelo, para que una publicación inminente no apague la caché", () => {
    expect(cacheTtlFor(3600, NOW, at("2026-08-27T12:00:02Z"))).toBe(30);
    expect(cacheTtlFor(3600, NOW, at("2026-08-27T11:59:00Z"))).toBe(30);
  });
});

describe("sameInstant", () => {
  it("compara en segundos, que es como lo guarda SQLite", () => {
    // El fallo clásico: unixepoch() son segundos y un Date de JS son milisegundos, así que un
    // ===  nunca coincide y la precondición rechaza absolutamente todos los guardados.
    expect(sameInstant(new Date(1787830206000), new Date(1787830206123))).toBe(true);
  });

  it("un segundo de diferencia sí es distinto", () => {
    expect(sameInstant(new Date(1787830206000), new Date(1787830207000))).toBe(false);
  });

  it("nulos nunca coinciden", () => {
    expect(sameInstant(null, new Date())).toBe(false);
    expect(sameInstant(new Date(), undefined)).toBe(false);
  });
});

describe("checkConflict", () => {
  const current = { updatedAt: new Date("2026-08-27T11:30:00Z"), title: "Portada" };

  it("sin expectativa no bloquea: un script que no le importa sigue funcionando", () => {
    expect(checkConflict(current, undefined).ok).toBe(true);
    expect(checkConflict(current, null).ok).toBe(true);
  });

  it("con la misma marca de tiempo deja pasar", () => {
    expect(checkConflict(current, new Date("2026-08-27T11:30:00.400Z")).ok).toBe(true);
  });

  it("con una marca antigua rechaza y dice cuándo cambió", () => {
    const result = checkConflict(current, new Date("2026-08-27T10:00:00Z"), "Ana");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Ana");
      expect(result.reason).toContain("perderías");
      expect(result.currentUpdatedAt).toEqual(current.updatedAt);
    }
  });

  it("sin nombre de quien cambió, el mensaje sigue teniendo sentido", () => {
    const result = checkConflict(current, new Date("2026-08-27T10:00:00Z"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).not.toContain("por ");
  });
});

describe("checkSchedule", () => {
  it("acepta una fecha futura", () => {
    const result = checkSchedule("2026-09-01T09:00:00Z", NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.publishAt.toISOString()).toBe("2026-09-01T09:00:00.000Z");
  });

  it("una fecha pasada se rechaza en vez de aceptarse y no verse", () => {
    const result = checkSchedule("2026-08-01T00:00:00Z", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("ya ha pasado");
  });

  it("un año mal escrito se caza", () => {
    const result = checkSchedule("2126-09-01T00:00:00Z", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("año");
  });

  it("basura y fechas inválidas", () => {
    for (const value of [null, undefined, 42, "no soy una fecha", ""]) {
      expect(checkSchedule(value, NOW).ok, String(value)).toBe(false);
    }
  });

  it("admite un Date directamente", () => {
    expect(checkSchedule(new Date("2026-09-01T00:00:00Z"), NOW).ok).toBe(true);
  });
});

describe("describeSchedule", () => {
  it("dice cuánto falta en la unidad que toca", () => {
    expect(describeSchedule(at("2026-08-27T12:30:00Z"), NOW)).toBe("en 30 min");
    expect(describeSchedule(at("2026-08-27T18:00:00Z"), NOW)).toBe("en 6 h");
    expect(describeSchedule(at("2026-08-30T12:00:00Z"), NOW)).toBe("en 3 días");
    expect(describeSchedule(at("2026-08-28T12:00:00Z"), NOW)).toBe("en 1 día");
  });

  it("una fecha ya pasada dice que espera la primera visita, que es la verdad", () => {
    expect(describeSchedule(at("2026-08-27T11:00:00Z"), NOW)).toContain("primera visita");
  });

  it("sin fecha no inventa texto", () => {
    expect(describeSchedule(null, NOW)).toBe("");
  });
});
