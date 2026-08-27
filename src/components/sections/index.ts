import Hero from "./Hero.astro";
import Prose from "./Prose.astro";
import Features from "./Features.astro";
import Steps from "./Steps.astro";
import Quotes from "./Quotes.astro";
import Faq from "./Faq.astro";
import Notice from "./Notice.astro";
import Split from "./Split.astro";
import Collection from "./Collection.astro";
import Gallery from "./Gallery.astro";
import Logos from "./Logos.astro";
import Stats from "./Stats.astro";
import Team from "./Team.astro";
import Pricing from "./Pricing.astro";
import Cta from "./Cta.astro";
import Contact from "./Contact.astro";

/**
 * The one unavoidable duplication in the sections design: a .astro component cannot be
 * imported from a module that gets bundled for the browser, so the registry (plain TS)
 * and this map are separate. A test asserts they hold the same keys — the same guard the
 * project already uses for computePath/recomputePaths.
 */
export const SECTION_COMPONENTS = {
  hero: Hero,
  prose: Prose,
  features: Features,
  steps: Steps,
  quotes: Quotes,
  faq: Faq,
  notice: Notice,
  split: Split,
  collection: Collection,
  gallery: Gallery,
  logos: Logos,
  stats: Stats,
  team: Team,
  pricing: Pricing,
  cta: Cta,
  contact: Contact,
} as const;
