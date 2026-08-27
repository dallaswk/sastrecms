import type { SectionDefinition } from "./types";
import { hero } from "./defs/hero";
import { prose } from "./defs/prose";
import { features } from "./defs/features";
import { steps } from "./defs/steps";
import { quotes } from "./defs/quotes";
import { faq } from "./defs/faq";
import { cta } from "./defs/cta";

/**
 * Every section type, keyed by `type`.
 *
 * Plain TypeScript on purpose — no Astro imports, no Vue, no node: builtins — so the Vue
 * island can import it directly and vitest can load it with no scaffolding. The Astro
 * components live in a separate map (src/components/sections/index.ts) because a .astro
 * file cannot be imported from code that gets bundled for the browser; a test asserts
 * the two stay in step.
 */
export const SECTIONS: Record<string, SectionDefinition> = Object.fromEntries(
  [hero, prose, features, steps, quotes, faq, cta].map((def) => [def.type, def])
);

/** What the picker offers: everything not retired. */
export function pickableSections(allowed?: string[]): SectionDefinition[] {
  return Object.values(SECTIONS)
    .filter((def) => !def.deprecated)
    .filter((def) => !allowed?.length || allowed.includes(def.type))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

export function getSection(type: string): SectionDefinition | undefined {
  return SECTIONS[type];
}
