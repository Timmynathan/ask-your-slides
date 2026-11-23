import "server-only";
import { createHash } from "node:crypto";
import { CALCULATION_RULES, CORE_INSTRUCTIONS, TURN_REMINDER } from "./prompt";
import { CALC_TOOLS, TOOLS } from "./tools";

// Which prompt produced an answer (owner, 23 Nov 2026: "if quality dips after a prompt change, which
// change did it?"). A short fingerprint of everything fixed in the prompt: the core rules, the
// calculation rules, the turn reminder and the tools' descriptions. Saved on every trace
// (traces.prompt_version) with the situation notes that were added that turn (traces.prompt_notes),
// so answers can be grouped by prompt and compared before and after a change.
export const PROMPT_VERSION = createHash("sha256")
  .update([CORE_INSTRUCTIONS, CALCULATION_RULES, TURN_REMINDER, ...[...TOOLS, ...CALC_TOOLS].map((t) => `${t.name}: ${t.description}`)].join("\n\u0000\n"))
  .digest("hex")
  .slice(0, 10);
