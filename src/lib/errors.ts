/**
 * El fallo, dicho de forma que la capa de arriba pueda traducirlo.
 *
 * Hasta ahora todo esto eran `new Error("Unauthorized")` y `new Error("Node not found")`, y el
 * resultado era que **todo fallo previsible salía como 500**. Bloqueaban bien —nadie veía nada
 * que no fuera suyo— pero un 500 le dice a quien llama «me he roto», no «no puedes» ni «no
 * existe». Un cliente que reintenta ante un 500 y se rinde ante un 403 hacía justo lo contrario
 * de lo correcto, y una herramienta de IA leyendo la respuesta no tenía forma de distinguir un
 * permiso de una avería.
 *
 * Sin importar nada del framework a propósito: `lib/permissions.ts` lo lanza y lo prueban tests
 * de vitest, que no pueden resolver `astro:actions`. Traducir es cosa de cada frontera —
 * `actions/_define.ts` y el manejador MCP—, y así hay un solo sitio por capa en vez de una
 * conversión repetida en cada handler.
 */

export type ErrorKind =
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "badRequest"
  | "conflict";

export class AppError extends Error {
  readonly kind: ErrorKind;

  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.name = "AppError";
    this.kind = kind;
  }
}

/** Sin sesión. 401. */
export function unauthorized(message = "No has iniciado sesión."): AppError {
  return new AppError("unauthorized", message);
}

/**
 * Con sesión, sin permiso. 403.
 *
 * Ojo con cuándo **no** usarlo: si el recurso pertenece a otro inquilino, la respuesta correcta
 * es `notFound`, no ésta. «No puedes» confirma que existe, y con varios clientes en la misma
 * instalación eso ya es filtrar algo.
 */
export function forbidden(message = "No tienes permiso para esto."): AppError {
  return new AppError("forbidden", message);
}

/** No existe, o no existe *para quien pregunta*. 404. */
export function notFound(message = "No existe."): AppError {
  return new AppError("notFound", message);
}

/** La petición está mal formada o pide algo imposible. 400. */
export function badRequest(message: string): AppError {
  return new AppError("badRequest", message);
}

/** El estado actual no permite la operación: borrar una carpeta con cosas dentro. 409. */
export function conflict(message: string): AppError {
  return new AppError("conflict", message);
}

/** El código de `ActionError` que le corresponde. */
export const ACTION_CODE: Record<ErrorKind, "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT"> = {
  unauthorized: "UNAUTHORIZED",
  forbidden: "FORBIDDEN",
  notFound: "NOT_FOUND",
  badRequest: "BAD_REQUEST",
  conflict: "CONFLICT",
};

/** El estado HTTP, para comprobarlo en los tests sin levantar Astro. */
export const HTTP_STATUS: Record<ErrorKind, number> = {
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  badRequest: 400,
  conflict: 409,
};
