// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPreferences,
  DEFAULT_PREFERENCES,
  parsePreferences,
  PREFERENCES_INIT_SCRIPT,
  resolveAttributes,
  STORAGE_KEY,
  type Preferences,
  type SystemSettings,
} from "./prefs";

const calm: SystemSettings = { dark: false, highContrast: false, reduceMotion: false };

function stubMatchMedia(sys: SystemSettings) {
  const map: Record<string, boolean> = {
    "(prefers-color-scheme: dark)": sys.dark,
    "(prefers-contrast: more)": sys.highContrast,
    "(prefers-reduced-motion: reduce)": sys.reduceMotion,
  };
  window.matchMedia = ((q: string) => ({ matches: !!map[q], media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}

const attrs = () => Object.fromEntries(Array.from(document.documentElement.attributes).filter((a) => a.name.startsWith("data-")).map((a) => [a.name, a.value]));

beforeEach(() => {
  window.localStorage.clear();
  for (const a of Array.from(document.documentElement.attributes)) if (a.name.startsWith("data-")) document.documentElement.removeAttribute(a.name);
});
afterEach(() => window.localStorage.clear());

describe("parsePreferences", () => {
  it("falls back to defaults for missing, corrupt or unexpected values", () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("not json")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences(JSON.stringify({ theme: "purple", textSize: 999, readableFont: "yes" }))).toEqual(DEFAULT_PREFERENCES);
  });
  it("keeps valid values", () => {
    const p: Preferences = { theme: "dark", contrast: "high", motion: "reduce", textSize: 130, readableFont: true, underlineLinks: true, increasedSpacing: true };
    expect(parsePreferences(JSON.stringify(p))).toEqual(p);
  });
});

describe("resolveAttributes", () => {
  it("defaults follow the system settings", () => {
    expect(resolveAttributes(DEFAULT_PREFERENCES, calm)).toMatchObject({ "data-theme": "light", "data-contrast": "normal", "data-motion": "full", "data-text": "100" });
    expect(resolveAttributes(DEFAULT_PREFERENCES, { dark: true, highContrast: true, reduceMotion: true })).toMatchObject({
      "data-theme": "dark",
      "data-contrast": "high",
      "data-motion": "reduce",
    });
  });
  it("explicit choices override the system in both directions", () => {
    const sys = { dark: true, highContrast: true, reduceMotion: true };
    expect(resolveAttributes({ ...DEFAULT_PREFERENCES, theme: "light", contrast: "normal", motion: "full" }, sys)).toMatchObject({
      "data-theme": "light",
      "data-contrast": "normal",
      "data-motion": "full",
    });
    expect(resolveAttributes({ ...DEFAULT_PREFERENCES, theme: "dark", contrast: "high", motion: "reduce" }, calm)).toMatchObject({
      "data-theme": "dark",
      "data-contrast": "high",
      "data-motion": "reduce",
    });
  });
  it("maps the toggles and text size", () => {
    expect(resolveAttributes({ ...DEFAULT_PREFERENCES, textSize: 150, readableFont: true, underlineLinks: true, increasedSpacing: true }, calm)).toMatchObject({
      "data-text": "150",
      "data-font": "readable",
      "data-links": "underline",
      "data-spacing": "increased",
    });
  });
});

describe("applyPreferences", () => {
  it("sets every attribute on <html>", () => {
    applyPreferences({ ...DEFAULT_PREFERENCES, theme: "dark", textSize: 115 }, document.documentElement, calm);
    expect(attrs()).toEqual({
      "data-theme": "dark",
      "data-contrast": "normal",
      "data-motion": "full",
      "data-text": "115",
      "data-font": "default",
      "data-links": "default",
      "data-spacing": "default",
    });
  });
});

describe("first-paint script", () => {
  const run = () => new Function(PREFERENCES_INIT_SCRIPT)();

  it("produces the same attributes as resolveAttributes for stored and system values", () => {
    const cases: Array<[Preferences, SystemSettings]> = [
      [DEFAULT_PREFERENCES, calm],
      [DEFAULT_PREFERENCES, { dark: true, highContrast: true, reduceMotion: true }],
      [{ theme: "light", contrast: "normal", motion: "full", textSize: 150, readableFont: true, underlineLinks: true, increasedSpacing: true }, { dark: true, highContrast: true, reduceMotion: true }],
      [{ theme: "dark", contrast: "high", motion: "reduce", textSize: 130, readableFont: false, underlineLinks: true, increasedSpacing: false }, calm],
    ];
    for (const [prefs, sys] of cases) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      stubMatchMedia(sys);
      run();
      expect(attrs()).toEqual(resolveAttributes(prefs, sys));
    }
  });

  it("survives corrupt storage", () => {
    window.localStorage.setItem(STORAGE_KEY, "{oops");
    stubMatchMedia(calm);
    run();
    expect(attrs()).toEqual(resolveAttributes(DEFAULT_PREFERENCES, calm));
  });
});
