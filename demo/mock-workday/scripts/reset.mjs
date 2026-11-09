import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../.data", import.meta.url));
rmSync(dir, { recursive: true, force: true });
console.log("Purged .data/ (offers and candidate personal emails).");
