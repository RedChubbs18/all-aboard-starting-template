/** Test helpers: a fake Anthropic client so adapter tests never touch the network. */
import type { BetaMessage, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { CLAUDE_MODEL, type AnthropicLike } from "./real";

/** Minimal BetaMessage carrying one text block (or none). */
export function message(text: string | null, stop_reason: BetaMessage["stop_reason"] = "end_turn"): BetaMessage {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: CLAUDE_MODEL,
    stop_reason,
    content: text === null ? [] : [{ type: "text", text, citations: null }],
  } as unknown as BetaMessage;
}

export const jsonMessage = (o: unknown) => message(JSON.stringify(o));

/** Records every request and answers with `respond` (which may throw to simulate API errors). */
export function fakeClient(respond: (p: MessageCreateParamsNonStreaming) => BetaMessage | Promise<BetaMessage>) {
  const calls: MessageCreateParamsNonStreaming[] = [];
  const client: AnthropicLike = {
    beta: {
      messages: {
        async create(p) {
          calls.push(p);
          return respond(p);
        },
      },
    },
  };
  return { client, calls };
}
