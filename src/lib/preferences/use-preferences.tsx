"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { applyPreferences, DEFAULT_PREFERENCES, parsePreferences, STORAGE_KEY, type Preferences } from "./prefs";

/** Tiny external store over localStorage so every component (and every tab) sees the same preferences. */
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: Preferences = DEFAULT_PREFERENCES;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): Preferences {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parsePreferences(raw);
  }
  return cached;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function savePreferences(next: Preferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or storage full: the change still applies for this page view below.
    cachedRaw = undefined;
    cached = next;
  }
  applyPreferences(next);
  listeners.forEach((l) => l());
}

/** Preferences for the settings page, and a mount-once effect (see PreferencesSync) that keeps <html> in step. */
export function usePreferences() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_PREFERENCES);
  const update = useCallback((patch: Partial<Preferences>) => savePreferences({ ...getSnapshot(), ...patch }), []);
  const reset = useCallback(() => savePreferences(DEFAULT_PREFERENCES), []);
  return { prefs, update, reset };
}

/**
 * Mount once in the root layout. Re-applies the attributes after hydration and whenever the preferences change
 * (including from another tab), and follows the operating system while a setting is on "system".
 */
export function PreferencesSync() {
  const { prefs } = usePreferences();
  useEffect(() => {
    applyPreferences(prefs);
    const queries = ["(prefers-color-scheme: dark)", "(prefers-contrast: more)", "(prefers-reduced-motion: reduce)"].map((q) => window.matchMedia(q));
    const onChange = () => applyPreferences(getSnapshot());
    queries.forEach((q) => q.addEventListener("change", onChange));
    return () => queries.forEach((q) => q.removeEventListener("change", onChange));
  }, [prefs]);
  return null;
}
