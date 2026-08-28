import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  AppError,
  ACTION_CODE,
  HTTP_STATUS,
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  conflict,
} from "./errors";

/**
 * Que un fallo previsible no salga como 500.
 *
 * Durante mucho tiempo todo esto era `new Error("Unauthorized")` y `new Error("Node not
 * found")`, y **todo** salía como 500. Bloqueaba bien —nadie veía nada ajeno— pero el código
 * decía «me he roto» donde tocaba decir «no puedes» o «no existe». Un cliente que reintenta ante
 * un 500 y se rinde ante un 403 hacía exactamente lo contrario de lo correcto.
 *
 * La mitad interesante de este fichero no son las tablas de abajo sino las dos comprobaciones
 * sobre el fuente: lo que se arregló una vez tiene que seguir arreglado cuando alguien escriba
 * la action número cincuenta y uno.
 */

describe("los tipos", () => {
  it("cada uno lleva su código y su estado", () => {
    expect(ACTION_CODE[unauthorized().kind]).toBe("UNAUTHORIZED");
    expect(ACTION_CODE[forbidden().kind]).toBe("FORBIDDEN");
    expect(ACTION_CODE[notFound().kind]).toBe("NOT_FOUND");
    expect(ACTION_CODE[badRequest("x").kind]).toBe("BAD_REQUEST");
    expect(ACTION_CODE[conflict("x").kind]).toBe("CONFLICT");

    expect(HTTP_STATUS.unauthorized).toBe(401);
    expect(HTTP_STATUS.forbidden).toBe(403);
    expect(HTTP_STATUS.notFound).toBe(404);
    expect(HTTP_STATUS.conflict).toBe(409);
  });

  it("sigue siendo un Error, para que un catch genérico lo trate como tal", () => {
    const error = notFound("Esa página no existe.");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Esa página no existe.");
  });

  it("las tablas cubren todos los tipos", () => {
    // Con `Record<ErrorKind, …>` añadir un tipo sin su código no compila; esto lo sujeta
    // también en el otro sentido, por si alguien relaja el tipo.
    for (const kind of Object.keys(ACTION_CODE)) {
      expect(HTTP_STATUS[kind as keyof typeof HTTP_STATUS]).toBeGreaterThan(0);
    }
  });
});

const ACTION_FILES = readdirSync("src/actions")
  .filter((name) => name.endsWith(".ts") && !name.startsWith("_") && name !== "index.ts")
  .map((name) => join("src/actions", name));

describe("ninguna action puede saltarse el traductor", () => {
  it("todas definen sus acciones con el envoltorio, no con astro:actions", () => {
    /*
     * Lo que hace que el arreglo no dependa de acordarse.
     *
     * `lib/permissions.ts` lanza `AppError` y quien lo convierte en un código HTTP es
     * `actions/_define.ts`. Una action definida con el `defineAction` de Astro se salta esa
     * conversión, y sus fallos de permiso vuelven a salir como 500 sin que nada lo diga.
     */
    const offenders = ACTION_FILES.filter((file) => {
      const source = readFileSync(file, "utf8");
      return /from "astro:actions"/.test(source);
    });
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("y ninguna lanza un Error pelado para algo que tiene código propio", () => {
    /*
     * Un `Error` pelado sale como 500. Para un fallo interno de verdad —R2 sin configurar, una
     * imagen ilegible— eso es correcto y por eso esto no los prohíbe todos. Lo que se prohíbe
     * es el que *describe* un caso previsible: si el mensaje dice «no existe» o «no tienes
     * permiso», el código no puede decir «me he roto».
     */
    const suspicious =
      /throw new Error\(\s*[`"'][^`"']*(unauthorized|forbidden|not found|no existe|no encontrad|sin permiso|no tienes|ya existe|already exists)/i;

    const offenders: string[] = [];
    for (const file of ACTION_FILES) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (suspicious.test(line)) offenders.push(`${file}:${index + 1} — ${line.trim()}`);
        });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("el guarda detectaría uno nuevo", () => {
    // Sin esto, un patrón roto dejaría los dos tests anteriores en verde sin comprobar nada.
    const suspicious =
      /throw new Error\(\s*[`"'][^`"']*(unauthorized|forbidden|not found|no existe|no encontrad|sin permiso|no tienes|ya existe|already exists)/i;
    expect(suspicious.test('      if (!node) throw new Error("Node not found");')).toBe(true);
    expect(suspicious.test('      throw new Error("Unauthorized");')).toBe(true);
    // Y dejaría pasar un fallo interno de verdad, que sí debe ser 500.
    expect(suspicious.test('      if (!r2) throw new Error("R2 bucket not configured");')).toBe(false);
  });

  it("encuentra ficheros de verdad, no cero por una ruta mal escrita", () => {
    expect(ACTION_FILES.length).toBeGreaterThan(10);
  });
});

describe("el MCP traduce por tipo, no por el texto del mensaje", () => {
  it("el manejador mira `instanceof AppError`", () => {
    /*
     * Antes reconocía los fallos de permiso con `/^Forbidden/i` sobre el mensaje. Funcionaba, y
     * el día que alguien tradujese ese mensaje al castellano un permiso habría pasado a
     * contarse como avería del servidor sin que nada fallara.
     */
    const source = readFileSync("src/pages/api/mcp.ts", "utf8");
    expect(source).toContain("error instanceof AppError");
    expect(source).not.toMatch(/\/\^Forbidden\/i/);
  });
});

describe("AppError se distingue de un fallo cualquiera", () => {
  it("un Error normal no es AppError, y por tanto sigue siendo 500", () => {
    expect(new Error("se ha roto algo") instanceof AppError).toBe(false);
  });
});
