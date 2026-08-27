/**
 * The sidebar's icons, as path data.
 *
 * A module rather than inline in the component for two reasons: the layout needs the *type* to
 * declare its nav items, and an .astro frontmatter cannot export one; and a path that is empty
 * or a name that does not exist renders as an invisible icon, which a test can catch here.
 *
 * Eleven glyphs, drawn on a 24 grid with a 1.75 stroke so they sit at the same optical weight
 * as the label beside them — 2 looks heavy next to UI text at this size, 1.5 disappears on a
 * dark ground. Hand-written rather than an icon package: a dependency for eleven paths would
 * ship a few hundred and a build step.
 */
export const ADMIN_ICONS = {
  dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z",
  content: "M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm9 0v5h5M8 13h7M8 17h5",
  media:
    "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Zm0 10 4.5-4.5a1.5 1.5 0 0 1 2 0L15 16m-1.5-1.5 1.75-1.75a1.5 1.5 0 0 1 2 0L20 15M9 9.5h.01",
  menu: "M4 6h16M4 12h10M4 18h13",
  inbox:
    "M4 13h4l1.5 2.5h5L16 13h4M4 13 6.5 5.5A1 1 0 0 1 7.45 5h9.1a1 1 0 0 1 .95.5L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5Z",
  types: "M4 7h16M4 12h16M4 17h9M7 4v16",
  users:
    "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 5 17.5V19m5.5-8.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 5.15a3 3 0 0 1 0 5.7",
  permissions: "M12 3.5 5 6.2v5.1c0 4.2 2.8 7.6 7 9.2 4.2-1.6 7-5 7-9.2V6.2L12 3.5Zm-2.2 8.9 1.9 1.9 3.6-3.9",
  settings:
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.1.1-1.4-.1-1.4 1.7-1.3-1.4-2.4-2 .8a7.3 7.3 0 0 0-2.4-1.4l-.3-2.1h-2.8l-.3 2.1a7.3 7.3 0 0 0-2.4 1.4l-2-.8L4.8 9.3l1.7 1.3-.1 1.4.1 1.4-1.7 1.3 1.4 2.4 2-.8a7.3 7.3 0 0 0 2.4 1.4l.3 2.1h2.8l.3-2.1a7.3 7.3 0 0 0 2.4-1.4l2 .8 1.4-2.4-1.7-1.3Z",
  token: "M14.5 4a5.5 5.5 0 1 1-4.9 8H8l-1.5 1.5L8 15v2.5H5.5L4 16v-2.6l5.6-5.6A5.5 5.5 0 0 1 14.5 4Z",
  external: "M13 5h6v6M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4",
  sun: "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2.5v2m0 15v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2.5 12h2m15 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z",
  logout: "M15 8V6a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2M11 12h9m0 0-3-3m3 3-3 3",
} as const;

export type AdminIconName = keyof typeof ADMIN_ICONS;
