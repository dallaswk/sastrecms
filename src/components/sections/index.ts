import Hero from "./Hero.astro";
import Cta from "./Cta.astro";

/**
 * The one unavoidable duplication in the sections design: a .astro component cannot be
 * imported from a module that gets bundled for the browser, so the registry (plain TS)
 * and this map are separate. A test asserts they hold the same keys — the same guard the
 * project already uses for computePath/recomputePaths.
 */
export const SECTION_COMPONENTS = {
  hero: Hero,
  cta: Cta,
} as const;
