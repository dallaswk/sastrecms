import type { SectionDefinition } from "./types";
import { hero } from "./defs/hero";
import { prose } from "./defs/prose";
import { features } from "./defs/features";
import { steps } from "./defs/steps";
import { quotes } from "./defs/quotes";
import { faq } from "./defs/faq";
import { gallery } from "./defs/gallery";
import { logos } from "./defs/logos";
import { stats } from "./defs/stats";
import { pricing } from "./defs/pricing";
import { split } from "./defs/split";
import { team } from "./defs/team";
import { notice } from "./defs/notice";
import { collection } from "./defs/collection";
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
  [
    hero, notice, prose, split, features, steps, collection,
    gallery, logos, stats, quotes, team, faq, pricing, cta,
  ].map((def) => [def.type, def])
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
