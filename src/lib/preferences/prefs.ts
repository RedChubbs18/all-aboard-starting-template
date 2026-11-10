/**
 * Accessibility and display preferences (D35). Pure logic, no React: the provider in use-preferences.tsx and the
 * inline first-paint script below both follow resolveAttributes(). Saved per device in localStorage.
 */
export type ThemePref = "system" | "light" | "dark";
export type ContrastPref = "system" | "normal" | "high";
export type MotionPref = "system" | "reduce" | "full";
export type TextSize = 100 | 115 | 130 | 150;

export interface Preferences {
  theme: ThemePref;
  contrast: ContrastPref;
  motion: MotionPref;
  textSize: TextSize;
  readableFont: boolean;
  underlineLinks: boolean;
  increasedSpacing: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  contrast: "system",
  motion: "system",
  textSize: 100,
  readableFont: false,
  underlineLinks: false,
  increasedSpacing: false,
};

export const STORAGE_KEY = "myjourney.preferences.v1";
export const TEXT_SIZES: readonly TextSize[] = [100, 115, 130, 150];

/** What the operating system or browser asks for. Used wherever a preference is "system". */
export interface SystemSettings {
  dark: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
}

export function parsePreferences(raw: string | null | undefined): Preferences {
  if (!raw) return DEFAULT_PREFERENCES;
  let o: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_PREFERENCES;
    o = parsed as Record<string, unknown>;
  } catch {
    return DEFAULT_PREFERENCES;
  }
  const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
  return {
    theme: pick(o.theme, ["system", "light", "dark"], "system"),
    contrast: pick(o.contrast, ["system", "normal", "high"], "system"),
    motion: pick(o.motion, ["system", "reduce", "full"], "system"),
    textSize: TEXT_SIZES.includes(o.textSize as TextSize) ? (o.textSize as TextSize) : 100,
    readableFont: o.readableFont === true,
    underlineLinks: o.underlineLinks === true,
    increasedSpacing: o.increasedSpacing === true,
  };
}

export function readSystemSettings(win: Pick<Window, "matchMedia"> = window): SystemSettings {
  const q = (query: string) => {
    try {
      return win.matchMedia(query).matches;
    } catch {
      return false;
    }
  };
  return {
    dark: q("(prefers-color-scheme: dark)"),
    highContrast: q("(prefers-contrast: more)"),
    reduceMotion: q("(prefers-reduced-motion: reduce)"),
  };
}

/** The data-* attributes on <html>. Every attribute is always present, so CSS and tests have one shape to read. */
export function resolveAttributes(p: Preferences, sys: SystemSettings): Record<string, string> {
  return {
    "data-theme": p.theme === "system" ? (sys.dark ? "dark" : "light") : p.theme,
    "data-contrast": p.contrast === "system" ? (sys.highContrast ? "high" : "normal") : p.contrast,
    "data-motion": p.motion === "system" ? (sys.reduceMotion ? "reduce" : "full") : p.motion,
    "data-text": String(p.textSize),
    "data-font": p.readableFont ? "readable" : "default",
    "data-links": p.underlineLinks ? "underline" : "default",
    "data-spacing": p.increasedSpacing ? "increased" : "default",
  };
}

export function applyPreferences(p: Preferences, root: HTMLElement = document.documentElement, sys: SystemSettings = readSystemSettings()) {
  for (const [k, v] of Object.entries(resolveAttributes(p, sys))) root.setAttribute(k, v);
}

/**
 * Inline script for the root layout: runs before first paint so there is no flash of the wrong theme.
 * Plain ES5 on purpose and self-contained (it cannot import). A test asserts it matches resolveAttributes().
 */
export const PREFERENCES_INIT_SCRIPT = `(function(){try{
var p={};try{p=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||"{}")||{}}catch(e){}
function m(q){try{return window.matchMedia(q).matches}catch(e){return false}}
function has(a,v){return a.indexOf(v)>-1}
var th=has(["light","dark"],p.theme)?p.theme:(m("(prefers-color-scheme: dark)")?"dark":"light");
var co=has(["normal","high"],p.contrast)?p.contrast:(m("(prefers-contrast: more)")?"high":"normal");
var mo=has(["reduce","full"],p.motion)?p.motion:(m("(prefers-reduced-motion: reduce)")?"reduce":"full");
var tx=has([100,115,130,150],p.textSize)?p.textSize:100;
var r=document.documentElement;
r.setAttribute("data-theme",th);r.setAttribute("data-contrast",co);r.setAttribute("data-motion",mo);
r.setAttribute("data-text",String(tx));
r.setAttribute("data-font",p.readableFont===true?"readable":"default");
r.setAttribute("data-links",p.underlineLinks===true?"underline":"default");
r.setAttribute("data-spacing",p.increasedSpacing===true?"increased":"default");
}catch(e){}})();`;
