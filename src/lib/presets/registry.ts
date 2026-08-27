import type { SitePreset } from "./types";
import { basico } from "./defs/basico";
import { despacho } from "./defs/despacho";
import { oficio } from "./defs/oficio";

/**
 * The verticals the wizard offers. Plain TypeScript, like the sections registry, so the
 * wizard script, the admin action and the tests all read the same declarations.
 */
export const PRESETS: Record<string, SitePreset> = Object.fromEntries(
  [basico, despacho, oficio].map((p) => [p.key, p])
);

export function getPreset(key: string): SitePreset | undefined {
  return PRESETS[key];
}

export function listPresets(): SitePreset[] {
  return Object.values(PRESETS);
}
