// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PreferencesSync } from "@/lib/preferences/use-preferences";
import { parsePreferences, STORAGE_KEY } from "@/lib/preferences/prefs";
import { AccessibilitySettings } from "./AccessibilitySettings";

function stubMatchMedia(matches: Record<string, boolean> = {}) {
  window.matchMedia = ((q: string) => ({ matches: !!matches[q], media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}

const html = () => document.documentElement;

beforeEach(() => {
  window.localStorage.clear();
  stubMatchMedia();
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function mount() {
  return render(
    <>
      <PreferencesSync />
      <AccessibilitySettings />
    </>,
  );
}

describe("Accessibility and display settings", () => {
  it("applies each preference to <html> and saves it to localStorage", () => {
    mount();
    fireEvent.click(screen.getByRole("radio", { name: "130%" }));
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    fireEvent.click(screen.getByRole("radio", { name: "High contrast" }));
    fireEvent.click(screen.getByRole("radio", { name: "Reduce motion" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Easy-to-read font" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Always underline links" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Increase spacing" }));

    expect(html()).toHaveAttribute("data-text", "130");
    expect(html()).toHaveAttribute("data-theme", "dark");
    expect(html()).toHaveAttribute("data-contrast", "high");
    expect(html()).toHaveAttribute("data-motion", "reduce");
    expect(html()).toHaveAttribute("data-font", "readable");
    expect(html()).toHaveAttribute("data-links", "underline");
    expect(html()).toHaveAttribute("data-spacing", "increased");

    expect(parsePreferences(window.localStorage.getItem(STORAGE_KEY))).toEqual({
      theme: "dark",
      contrast: "high",
      motion: "reduce",
      textSize: 130,
      readableFont: true,
      underlineLinks: true,
      increasedSpacing: true,
    });
  });

  it("restores saved choices after a reload and shows them in the controls", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: "dark", textSize: 150, underlineLinks: true }));
    mount();
    expect(html()).toHaveAttribute("data-theme", "dark");
    expect(html()).toHaveAttribute("data-text", "150");
    expect(screen.getByRole("radio", { name: "150%" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Always underline links" })).toBeChecked();
  });

  it("defaults follow the operating system until the user chooses", () => {
    stubMatchMedia({ "(prefers-color-scheme: dark)": true, "(prefers-reduced-motion: reduce)": true });
    mount();
    expect(html()).toHaveAttribute("data-theme", "dark");
    expect(html()).toHaveAttribute("data-motion", "reduce");
    // The user can override the OS in both directions.
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    fireEvent.click(screen.getByRole("radio", { name: "Allow motion" }));
    expect(html()).toHaveAttribute("data-theme", "light");
    expect(html()).toHaveAttribute("data-motion", "full");
  });

  it("reset returns to the device defaults", () => {
    mount();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(html()).toHaveAttribute("data-theme", "light");
    expect(screen.getAllByRole("radio", { name: "Match my device", checked: true })).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "100%" })).toBeChecked();
  });
});
