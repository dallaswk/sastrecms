import type { FieldDefinition } from "@lib/fields/types";
import type { SectionInstance } from "@lib/sections/types";
import type { SiteMenus } from "@lib/menus";
import type { SiteTheme } from "@db/schema";

/**
 * A starting point for a whole site: content types, pages with their blocks, navigation
 * and a palette. This is the multiplier for "a site in a day" — the wizard currently
 * finishes with five pages whose fields are `{}`, no menu and no theme, so every site
 * starts from the same blank slate no matter how many you have built.
 *
 * Presets are code, not data. A vertical is a set of design decisions, and putting them
 * in the database is how page builders become unmaintainable.
 */
export type SitePreset = {
  key: string;
  label: string;
  /** Shown in the wizard, so say who it is for rather than what it contains. */
  description: string;
  tagline: string;
  theme: SiteTheme;
  /** Content types beyond the three the seed always creates. */
  contentTypes?: PresetContentType[];
  pages: PresetPage[];
  /** Menus reference pages by slug: ids do not exist until the preset is applied. */
  menus: PresetMenus;
};

export type PresetContentType = {
  key: string;
  label: string;
  icon?: string;
  hasArchive?: boolean;
  supportsChildren?: boolean;
  fieldSchema: FieldDefinition[];
};

export type PresetPage = {
  slug: string;
  title: string;
  /** Slug of another page in this preset. Parents must be declared before children. */
  parentSlug?: string;
  contentTypeKey?: string;
  /** Sections without the ids and versions the server stamps on. */
  sections?: PresetSection[];
  fields?: Record<string, unknown>;
  publish?: boolean;
};

/**
 * A section as declared in a preset.
 *
 * Any value of a `relation` field holds a *page slug* from this same preset, not a node
 * id — ids do not exist until it is applied. The applier rewrites them, so a preset can
 * ship a listing block that already points somewhere instead of one the installer has to
 * wire up by hand.
 */
export type PresetSection = Pick<SectionInstance, "type" | "data"> & { anchor?: string };

export type PresetMenuItem = { label: string; slug?: string; url?: string };
export type PresetMenus = Partial<Record<keyof SiteMenus, PresetMenuItem[]>>;
