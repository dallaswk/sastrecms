/**
 * Decodes an Astro action response for the boundary harness.
 *
 * Actions answer in devalue, not JSON: `[[indices], {shape}, ...values]`, with dates and
 * references resolved by position. Reading it with `JSON.parse` gives you an array of integers
 * and no way to tell a leak from a block — which is exactly how a first version of the harness
 * reported everything as «respuesta ilegible» and would have reported a real leak the same way.
 *
 * Errors come back as plain JSON, so both shapes are tried.
 *
 * Usage: node decode-action.mjs '<body>'   → JSON on stdout
 */
import { parse } from "devalue";

const raw = process.argv[2] ?? "";

function decode(text) {
  try {
    return { ok: true, value: parse(text) };
  } catch {}
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {}
  return { ok: false, value: null };
}

const { ok, value } = decode(raw);
process.stdout.write(JSON.stringify(ok ? value : { __unreadable: raw.slice(0, 120) }));
