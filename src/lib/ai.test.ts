import { describe, it, expect } from "vitest";
import {
  normaliseBaseUrl,
  isConfigured,
  missingAiFields,
  AI_PROVIDERS,
  DEFAULT_AI_BASE_URL,
} from "./ai";

describe("normaliseBaseUrl", () => {
  it("quita la barra final", () => {
    expect(normaliseBaseUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1");
    expect(normaliseBaseUrl("https://api.openai.com/v1///")).toBe("https://api.openai.com/v1");
  });

  it("quita el /chat/completions que se pega por error", () => {
    // Es la URL que sale en los ejemplos de la documentación, así que se pega tal cual.
    expect(normaliseBaseUrl("https://api.groq.com/openai/v1/chat/completions")).toBe(
      "https://api.groq.com/openai/v1"
    );
  });

  it("vacío cae al valor por defecto", () => {
    expect(normaliseBaseUrl("")).toBe(DEFAULT_AI_BASE_URL);
    expect(normaliseBaseUrl(undefined)).toBe(DEFAULT_AI_BASE_URL);
    expect(normaliseBaseUrl("   ")).toBe(DEFAULT_AI_BASE_URL);
  });
});

describe("isConfigured", () => {
  it("un proveedor alojado necesita clave y modelo", () => {
    expect(isConfigured({ baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" })).toBe(false);
    expect(isConfigured({ baseUrl: "https://api.openai.com/v1", apiKey: "sk-x" })).toBe(false);
    expect(isConfigured({ baseUrl: "https://api.openai.com/v1", apiKey: "sk-x", model: "gpt-4o-mini" })).toBe(true);
  });

  it("un Ollama local no necesita clave", () => {
    // Pedirle una haría que la opción local pareciera rota.
    expect(isConfigured({ baseUrl: "http://localhost:11434/v1", model: "llama3.2" })).toBe(true);
    expect(isConfigured({ baseUrl: "http://127.0.0.1:11434/v1", model: "llama3.2" })).toBe(true);
  });

  it("no lanza con nada", () => {
    expect(isConfigured(null)).toBe(false);
    expect(isConfigured(undefined)).toBe(false);
    expect(isConfigured({})).toBe(false);
  });

  it("una clave en blanco no cuenta como clave", () => {
    expect(isConfigured({ apiKey: "   ", model: "x" })).toBe(false);
  });
});

describe("missingAiFields", () => {
  it("nombra lo que falta con las palabras de la pantalla", () => {
    expect(missingAiFields({})).toEqual(["modelo", "clave de API"]);
    expect(missingAiFields({ model: "gpt-4o-mini" })).toEqual(["clave de API"]);
    expect(missingAiFields({ apiKey: "sk-x" })).toEqual(["modelo"]);
  });

  it("en local no reclama la clave", () => {
    expect(missingAiFields({ baseUrl: "http://localhost:11434/v1", model: "x" })).toEqual([]);
  });
});

describe("AI_PROVIDERS", () => {
  it("cada preset trae URL base y un modelo que existe de verdad", () => {
    for (const provider of AI_PROVIDERS) {
      expect(provider.baseUrl, provider.key).toMatch(/^https?:\/\//);
      expect(provider.model.length, provider.key).toBeGreaterThan(2);
      expect(provider.label, provider.key).toBeTruthy();
    }
  });

  it("las claves no se repiten", () => {
    const keys = AI_PROVIDERS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("cada URL base sobrevive a la normalización sin cambiar", () => {
    // Si un preset se guardara distinto de como está escrito, el selector no reconocería
    // el valor ya guardado y siempre mostraría «personalizado».
    for (const provider of AI_PROVIDERS) {
      expect(normaliseBaseUrl(provider.baseUrl), provider.key).toBe(provider.baseUrl);
    }
  });
});
