/**
 * Manual smoke test of the REAL WS6 adapters against the Anthropic API. Not run in CI.
 *
 *   npx tsx --conditions=react-server scripts/try-ai.mts ["your question"] [path/to/photo.jpg]
 *
 * (`--conditions=react-server` satisfies the `server-only` guard in the adapters.)
 *
 * Needs ANTHROPIC_API_KEY in .env (server-side only, never committed). Uses the synthetic
 * corpus in content/seed/. Use a synthetic or consenting test photo; nothing is stored.
 */
import { existsSync, readFileSync } from "node:fs";
import { createChatbotReal, defaultAnthropicClient } from "../src/adapters/chatbot/real";
import { createPhotoCheckReal } from "../src/adapters/photocheck/real";
import type { ChatCorpus } from "../src/adapters/chatbot/types";

if (existsSync(".env")) process.loadEnvFile(".env");
const client = defaultAnthropicClient();
if (!client) {
  console.log("ANTHROPIC_API_KEY is not set. Add it to .env (never commit it) and re-run.");
  process.exit(0);
}

const read = <T,>(f: string): T => JSON.parse(readFileSync(f, "utf8")) as T;
const faqs = read<{ id: string; question: string; answer: string; tags: string[] }[]>("content/seed/faqs.json");
const content = read<{ slug: string; title: string; summary: string; body: string }[]>("content/seed/content.json");
const corpus: ChatCorpus = { faqs, content: content.map(({ slug, title, summary, body }) => ({ slug, title, summary, body })) };

const question = process.argv[2] ?? "When do I get paid, and where do I see my payslip?";
console.log(`Q: ${question}`);
let t = Date.now();
console.log(await createChatbotReal({ client }).ask(question, corpus), `${Date.now() - t}ms`);

const photo = process.argv[3];
if (photo) {
  const image = new Uint8Array(readFileSync(photo));
  t = Date.now();
  console.log(`Photo check (${photo}, ${image.length} bytes):`);
  console.log(await createPhotoCheckReal({ client }).check({ image, fileName: photo.split("/").pop() }), `${Date.now() - t}ms`);
} else {
  console.log("No photo path given; skipping the photo check.");
}
