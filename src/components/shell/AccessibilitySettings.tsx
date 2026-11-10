"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { usePreferences } from "@/lib/preferences/use-preferences";
import { TEXT_SIZES, type ContrastPref, type MotionPref, type ThemePref } from "@/lib/preferences/prefs";

interface Option<T extends string | number> {
  value: T;
  label: string;
}

/** A fieldset of native radio buttons. Each row has a 44px target (WCAG 2.5.8). */
function RadioGroup<T extends string | number>({
  legend,
  hint,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  hint: string;
  name: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
}) {
  const hintId = useId();
  return (
    <fieldset aria-describedby={hintId} className="rounded-md border border-line bg-card px-[22px] py-5">
      <legend className="px-1 text-lg font-bold">{legend}</legend>
      <p id={hintId} className="text-sm text-muted">
        {hint}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-6">
        {options.map((o) => (
          <label key={String(o.value)} className="flex min-h-11 cursor-pointer items-center gap-2">
            <input
              type="radio"
              name={name}
              value={String(o.value)}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
              className="size-5 accent-[var(--color-brand)]"
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start gap-1 rounded-md border border-line bg-card py-2 pl-2 pr-[22px]">
      <Checkbox id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={`${id}-h`} />
      <div className="pt-2.5">
        <label htmlFor={id} className="cursor-pointer font-bold">
          {label}
        </label>
        <p id={`${id}-h`} className="text-sm text-muted">
          {hint}
        </p>
      </div>
    </div>
  );
}

const THEMES: Option<ThemePref>[] = [
  { value: "system", label: "Match my device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const CONTRASTS: Option<ContrastPref>[] = [
  { value: "system", label: "Match my device" },
  { value: "normal", label: "Standard" },
  { value: "high", label: "High contrast" },
];
const MOTIONS: Option<MotionPref>[] = [
  { value: "system", label: "Match my device" },
  { value: "reduce", label: "Reduce motion" },
  { value: "full", label: "Allow motion" },
];

/** D35: appearance and accessibility preferences, saved on this device and applied straight away. */
export function AccessibilitySettings() {
  const { prefs, update, reset } = usePreferences();
  const [message, setMessage] = useState("");
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  // Clear, then set on the next frame, so the same text is announced again after every save (WCAG 4.1.3).
  const announce = (text: string) => {
    cancelAnimationFrame(frame.current);
    setMessage("");
    frame.current = requestAnimationFrame(() => setMessage(text));
  };
  const set = (patch: Parameters<typeof update>[0]) => {
    update(patch);
    announce("Saved on this device.");
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight text-ink">Accessibility and display</h1>
        <p className="mt-1 text-muted">Changes apply straight away and are saved on this device only.</p>
      </header>

      <RadioGroup
        legend="Text size"
        hint="Makes text and the spaces around it larger across the whole app."
        name="text-size"
        value={prefs.textSize}
        options={TEXT_SIZES.map((v) => ({ value: v, label: `${v}%` }))}
        onChange={(v) => set({ textSize: v })}
      />
      <RadioGroup legend="Theme" hint="Light or dark colours." name="theme" value={prefs.theme} options={THEMES} onChange={(v) => set({ theme: v })} />
      <RadioGroup
        legend="Contrast"
        hint="High contrast uses stronger borders and text colours."
        name="contrast"
        value={prefs.contrast}
        options={CONTRASTS}
        onChange={(v) => set({ contrast: v })}
      />
      <RadioGroup
        legend="Motion"
        hint="Animations such as the horse moving along the track. This overrides your device setting."
        name="motion"
        value={prefs.motion}
        options={MOTIONS}
        onChange={(v) => set({ motion: v })}
      />

      <Toggle
        label="Easy-to-read font"
        hint="Uses a plain system font with wider letter, word and line spacing."
        checked={prefs.readableFont}
        onChange={(v) => set({ readableFont: v })}
      />
      <Toggle
        label="Always underline links"
        hint="Links are underlined everywhere, not only on hover."
        checked={prefs.underlineLinks}
        onChange={(v) => set({ underlineLinks: v })}
      />
      <Toggle
        label="Increase spacing"
        hint="More space between lines, paragraphs and controls."
        checked={prefs.increasedSpacing}
        onChange={(v) => set({ increasedSpacing: v })}
      />

      <p role="status" className="min-h-6 text-sm text-muted">
        {message}
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          reset();
          announce("Preferences reset to match your device.");
        }}
      >
        Reset to defaults
      </Button>
    </div>
  );
}
