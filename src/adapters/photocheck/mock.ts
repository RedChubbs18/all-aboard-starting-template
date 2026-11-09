import { statusMock } from "../mock-helpers";
import type { StateStore } from "../types";
import type { PhotoCheckAdapter } from "./types";

/**
 * Demo rules keyed off the file name. Word starts only, so "chat.jpg" or "what.png" do not trip the hat rule.
 * Matching is case-insensitive.
 */
const RULES: [RegExp, string][] = [
  [/sunglass|shades/i, "Sunglasses are not allowed. Please remove them."],
  [/(?<![a-z])(hats?|caps?|beanie|hood(ie)?s?)(?![a-z])|sunhat/i, "Hats and head coverings (other than religious or medical) are not allowed."],
  [/blur|unclear|out-of-focus|(?<![a-z])(dark|far)(?![a-z])/i, "Your face is not clearly visible. Use a well-lit, in-focus, front-facing photo."],
];

/** Demo rule: the file name decides (e.g. "me-sunglasses.jpg" fails). Empty input fails. Image bytes are never kept. */
export function createPhotoCheckMock(store: StateStore): PhotoCheckAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "photocheck", "ready", ["ready"]);
  return {
    ...m,
    key: "photocheck",
    async check(input) {
      const issues: string[] = [];
      if (!input.image?.length && !input.fileName) issues.push("No photo supplied.");
      if (input.mimeType && !/^image\/(jpeg|png|webp|heic)$/i.test(input.mimeType)) {
        issues.push("The file must be a JPEG, PNG, WebP or HEIC photo.");
      }
      for (const [re, msg] of RULES) if (input.fileName && re.test(input.fileName)) issues.push(msg);
      return { pass: issues.length === 0, issues };
    },
  };
}
