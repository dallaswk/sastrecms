/**
 * An OpenAI-compatible chat endpoint.
 *
 * Compatible, not OpenAI: the base URL is configurable, so the same setting works with OpenAI,
 * Groq, OpenRouter, DeepSeek, Mistral, Together, a self-hosted vLLM or a local Ollama. They all
 * speak `POST /chat/completions` with the same body, and pinning the project to one vendor
 * would be a decision the client is stuck with.
 *
 * `fetch`, no SDK: every official SDK pulls in node builtins that do not exist on Workers.
 */

export type AiConfig = {
  /** Without the `/chat/completions` suffix, e.g. `https://api.openai.com/v1`. */
  baseUrl?: string;
  apiKey?: string;
  model?: string;
};

export const DEFAULT_AI_BASE_URL = "https://api.openai.com/v1";

/** Presets for the selector, so nobody has to remember a base URL. */
export const AI_PROVIDERS = [
  { key: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { key: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { key: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  { key: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { key: "mistral", label: "Mistral", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  { key: "ollama", label: "Ollama (local)", baseUrl: "http://localhost:11434/v1", model: "llama3.2" },
] as const;

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };

export type AiResult =
  | { ok: true; text: string; model?: string; usage?: { prompt: number; completion: number } }
  | { ok: false; reason: string; status?: number };

/** Trailing slashes and an accidentally-pasted `/chat/completions` both normalise away. */
export function normaliseBaseUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return DEFAULT_AI_BASE_URL;
  return value.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
}

/**
 * Whether the configuration is complete enough to try.
 *
 * A base URL alone is not: a local Ollama needs no key, but every hosted provider does, and
 * calling one without a key produces a 401 that reads like a broken integration rather than a
 * missing setting.
 */
export function isConfigured(config: AiConfig | null | undefined): boolean {
  if (!config) return false;
  const base = normaliseBaseUrl(config.baseUrl);
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(base);
  return !!config.model?.trim() && (isLocal || !!config.apiKey?.trim());
}

/** What is missing, in the words the settings page uses. */
export function missingAiFields(config: AiConfig | null | undefined): string[] {
  const missing: string[] = [];
  const base = normaliseBaseUrl(config?.baseUrl);
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(base);
  if (!config?.model?.trim()) missing.push("modelo");
  if (!isLocal && !config?.apiKey?.trim()) missing.push("clave de API");
  return missing;
}

/**
 * Reads the provider's error body for the sentence a person can act on.
 *
 * These APIs answer with `{error: {message}}`, and the message is usually the useful part —
 * «model not found», «insufficient quota». Showing the raw status instead makes every failure
 * look the same, and the two most common ones have completely different fixes.
 */
function reasonFrom(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string };
    const message =
      typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
    if (message) return message;
  } catch {
    // Not JSON. Fall through to the status.
  }

  if (status === 401 || status === 403) return "La clave de API no es válida o no tiene permiso.";
  if (status === 404) return "No existe ese modelo, o la URL base no es la correcta.";
  if (status === 429) return "Demasiadas peticiones o cuota agotada.";
  if (status >= 500) return `El proveedor ha respondido ${status}.`;
  return body.slice(0, 200) || `Ha respondido ${status}.`;
}

export type CompletionOptions = {
  /** Kept low by default: this generates page copy, not essays. */
  maxTokens?: number;
  temperature?: number;
  /** Milliseconds. A hung provider must not hold an editor's request open forever. */
  timeoutMs?: number;
  /** Ask for a JSON object back, when the provider supports it. */
  json?: boolean;
};

/**
 * One completion.
 *
 * Never throws: every failure comes back as `{ok: false, reason}` because the caller is always
 * a UI that has to say what went wrong, and an exception crossing an action boundary turns a
 * bad API key into a 500.
 */
export async function chatCompletion(
  config: AiConfig,
  messages: AiMessage[],
  options: CompletionOptions = {}
): Promise<AiResult> {
  const missing = missingAiFields(config);
  if (missing.length > 0) {
    return { ok: false, reason: `Falta ${missing.join(" y ")} en Ajustes → Inteligencia artificial.` };
  }

  const url = `${normaliseBaseUrl(config.baseUrl)}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey?.trim() ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.7,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, reason: reasonFrom(response.status, body), status: response.status };
    }

    const data = (await response.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      // A 200 with no content happens: a content filter, or a model that only returned a tool
      // call. Reported as a failure, because an empty string would be pasted into a page.
      return { ok: false, reason: "El proveedor ha respondido sin texto." };
    }

    return {
      ok: true,
      text,
      ...(data.model ? { model: data.model } : {}),
      ...(data.usage
        ? {
            usage: {
              prompt: data.usage.prompt_tokens ?? 0,
              completion: data.usage.completion_tokens ?? 0,
            },
          }
        : {}),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reason: "El proveedor ha tardado demasiado en responder." };
    }
    return { ok: false, reason: error instanceof Error ? error.message : "No se ha podido conectar." };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * A minimal round trip, for the «Probar conexión» button.
 *
 * A real completion rather than a `GET /models`: some providers do not implement the models
 * endpoint, and more to the point, a key that can list models but cannot complete would test
 * green and fail in use.
 */
export async function testConnection(config: AiConfig): Promise<AiResult> {
  return chatCompletion(
    config,
    [{ role: "user", content: "Responde únicamente con la palabra: OK" }],
    { maxTokens: 8, temperature: 0, timeoutMs: 15_000 }
  );
}
