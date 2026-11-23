import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { READ_PAGES_PROMPT } from "./process";

// Chat memory for photos (owner, 23 Nov 2026). The photos a student sends with a question aren't kept;
// after the answer, Haiku writes out their text once and it is saved on that message (messages.photo_text),
// so later turns in the chat still have the paper. About $0.0004 a page.

const READ_MODEL = process.env.CHAT_MODEL || "claude-haiku-5-5";
const USD_PER_MTOK = { input: 0.1, output: 0.5 };
/** Enough for a few dense pages; history stays bounded. */
export const PHOTO_TEXT_MAX = 12_000;

/** `images` are the data URLs the chat received (jpeg/png/webp). */
export async function readPhotos(images: string[]): Promise<{ text: string; cost: number }> {
  const content = [
    ...images.map((url) => {
      const [head, data] = url.split(",", 2);
      const mediaType = head.slice(5, head.indexOf(";"));
      return { type: "image" as const, image: data, mediaType };
    }),
    { type: "text" as const, text: READ_PAGES_PROMPT },
  ];
  const { text, usage } = await generateText({
    model: anthropic(READ_MODEL),
    messages: [{ role: "user", content }],
    maxOutputTokens: 6_000,
    providerOptions: { anthropic: { thinking: { type: "disabled" } } },
  });
  const cost = ((usage.inputTokens ?? 0) * USD_PER_MTOK.input + (usage.outputTokens ?? 0) * USD_PER_MTOK.output) / 1e6;
  return { text: text.trim().slice(0, PHOTO_TEXT_MAX), cost };
}
