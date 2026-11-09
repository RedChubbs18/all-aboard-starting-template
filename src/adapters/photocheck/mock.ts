import { statusMock } from "../mock-helpers";
import type { StateStore } from "../types";
import type { PhotoCheckAdapter } from "./types";

const RULES: [RegExp, string][] = [
  [/sunglass|shades/i, "Sunglasses are not allowed. Please remove them."],
  [/hat|cap|hood/i, "Hats and head coverings (other than religious or medical) are not allowed."],
  [/blur|dark|unclear|far/i, "Your face is not clearly visible. Use a well-lit, in-focus, front-facing photo."],
];

/** Demo rule: the file name decides (e.g. "me-sunglasses.jpg" fails). Empty input fails. */
export function createPhotoCheckMock(store: StateStore): PhotoCheckAdapter & ReturnType<typeof statusMock> {
  const m = statusMock(store, "photocheck", "ready", ["ready"]);
  return {
    ...m,
    key: "photocheck",
    async check(input) {
      const issues: string[] = [];
      if (!input.image?.length && !input.fileName) issues.push("No photo supplied.");
      for (const [re, msg] of RULES) if (input.fileName && re.test(input.fileName)) issues.push(msg);
      return { pass: issues.length === 0, issues };
    },
  };
}
