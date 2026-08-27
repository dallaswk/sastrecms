import { describe, it, expect } from "vitest";
import {
  ANALYTICS_ID_SHAPES,
  isValidAnalyticsId,
  sanitizeAnalyticsIds,
  type AnalyticsIds,
} from "./analytics";

/**
 * These ids are interpolated straight into inline <script> tags. The patterns are the
 * only thing standing between a settings field and arbitrary JavaScript on every public
 * page, so they get tested against real payloads, not just happy-path values.
 */

const VALID: [keyof AnalyticsIds, string][] = [
  ["ga4", "G-ABC1234"],
  ["ga4", "G-xyz98765"],
  ["gtm", "GTM-ABC123"],
  ["metaPixel", "1234567890123"],
  ["tiktokPixel", "C4A1B2C3D4E5"],
  ["hotjar", "1234567"],
  ["gscVerification", "abc-DEF_123456789"],
];

const INJECTIONS: [keyof AnalyticsIds, string][] = [
  // breaks out of hjid:${...}
  ["hotjar", '1,x:eval(atob("YWxlcnQoMSk="))'],
  ["hotjar", "1};alert(1);//"],
  // breaks out of gtag('config','${...}')
  ["ga4", "G-1');alert(1);//"],
  ["gtm", "GTM-1';document.location='//evil'//"],
  ["metaPixel", "1');fbq('track','x'"],
  ["tiktokPixel", "1');ttq.load('x'"],
  ["gscVerification", '"><script>alert(1)</script>'],
  // closing the script element outright
  ["ga4", "G-ABC</script><script>alert(1)</script>"],
];

describe("isValidAnalyticsId", () => {
  it.each(VALID)("accepts a real %s: %s", (key, value) => {
    expect(isValidAnalyticsId(key, value)).toBe(true);
  });

  it.each(INJECTIONS)("rejects an injection in %s: %s", (key, value) => {
    expect(isValidAnalyticsId(key, value)).toBe(false);
  });

  it("rejects the empty string", () => {
    // The Zod schema allows "" separately, to clear a field. Nothing should ever
    // render an empty id into a script.
    for (const key of Object.keys(ANALYTICS_ID_SHAPES) as (keyof AnalyticsIds)[]) {
      expect(isValidAnalyticsId(key, "")).toBe(false);
    }
  });

  it("rejects non-strings", () => {
    for (const value of [null, undefined, 123, {}, ["G-ABC1234"]]) {
      expect(isValidAnalyticsId("ga4", value)).toBe(false);
    }
  });

  it("rejects a valid id with anything appended or prepended", () => {
    expect(isValidAnalyticsId("hotjar", " 1234567")).toBe(false);
    expect(isValidAnalyticsId("hotjar", "1234567 ")).toBe(false);
    expect(isValidAnalyticsId("ga4", "xG-ABC1234")).toBe(false);
  });

  it("rejects a newline-smuggled payload", () => {
    // ^...$ without the m flag: a trailing newline must not let a second line through.
    expect(isValidAnalyticsId("hotjar", "1234567\nalert(1)")).toBe(false);
    expect(isValidAnalyticsId("hotjar", "1234567\n")).toBe(false);
  });
});

describe("sanitizeAnalyticsIds", () => {
  it("keeps the good entries and drops the bad ones in the same object", () => {
    expect(
      sanitizeAnalyticsIds({
        ga4: "G-ABC1234",
        hotjar: '1,x:eval(atob("YWxlcnQoMSk="))',
      })
    ).toEqual({ ga4: "G-ABC1234" });
  });

  it("drops keys it does not know about", () => {
    expect(sanitizeAnalyticsIds({ ga4: "G-ABC1234", evil: "anything" })).toEqual({
      ga4: "G-ABC1234",
    });
  });

  it("returns an empty object for a missing or malformed column", () => {
    expect(sanitizeAnalyticsIds(null)).toEqual({});
    expect(sanitizeAnalyticsIds(undefined)).toEqual({});
    expect(sanitizeAnalyticsIds("not an object")).toEqual({});
  });

  it("never returns a value that would escape its script context", () => {
    const dirty = Object.fromEntries(INJECTIONS);
    for (const value of Object.values(sanitizeAnalyticsIds(dirty))) {
      expect(value).not.toMatch(/['"`;<>()\\]|\s/);
    }
  });
});
