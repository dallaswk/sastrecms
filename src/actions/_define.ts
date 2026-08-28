import { defineAction as astroDefineAction, ActionError } from "astro:actions";
import { AppError, ACTION_CODE } from "@lib/errors";

/**
 * `defineAction` con la traducción de errores puesta.
 *
 * Existe por un problema concreto: `lib/permissions.ts` no puede importar `astro:actions` —lo
 * prueban tests de vitest, que no saben resolverlo— así que lanza `AppError`. Sin traducir, un
 * `AppError` sale de una action como 500, que es el fallo que esto viene a arreglar.
 *
 * Traducir aquí y no en cada handler no es comodidad, es lo que lo hace imposible de olvidar.
 * Con la conversión repetida en cincuenta sitios, la action número cincuenta y uno vuelve a
 * responder 500 y nadie se entera hasta que un cliente reintenta un 500 que era un «no puedes».
 *
 * Lo que **no** hace: tocar lo que no sea `AppError`. Un fallo de verdad —R2 sin configurar, una
 * imagen ilegible— sigue saliendo como 500, porque eso es lo que es.
 *
 * Se tipa como `typeof astroDefineAction` entero, no con `Parameters<>` ni copiando la firma a
 * mano. Con `Parameters<>` se pierden los genéricos, y con ellos los tipos de entrada y de
 * respuesta que ve quien llama desde el cliente; copiarla exigiría importar `ActionHandler` y
 * `ActionClient`, que Astro no exporta por ninguna ruta pública. Prestar la firma completa
 * conserva la inferencia y no depende de rutas internas. El `any` de dentro es el precio, y se
 * queda en estas cuatro líneas.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const defineAction: typeof astroDefineAction = ((config: any) =>
  astroDefineAction({
    ...config,
    handler: async (input: any, context: any) => {
      try {
        return await config.handler(input, context);
      } catch (error) {
        if (error instanceof AppError) {
          throw new ActionError({ code: ACTION_CODE[error.kind], message: error.message });
        }
        throw error;
      }
    },
  })) as typeof astroDefineAction;

// Re-exportado para que un fichero de actions no tenga que importar de dos sitios.
export { ActionError };
