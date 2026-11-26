// Owner's answer review, 26 Nov 2026: checking out loud mid-answer, "next slide" read as the rest of the deck,
// slides called wrong, and an invented surname. The lines below are the ones students actually saw.
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { plainSlideTalk, isContinuation, asksForNextSlide } = await import("@/lib/agent/run");
const { partnerContext, TURN_REMINDER, CALCULATION_RULES } = await import("@/lib/agent/prompt");

describe("checking out loud in the middle of an answer", () => {
  it("drops a <general> block that only says it will check with the calculator", () => {
    expect(plainSlideTalk("pH = 7.46. [[s:X-1-2]]\n\n<general>\nLet me check that with the calculator.\n\n</general>\n\nThe slide is right.")).toBe("pH = 7.46. [[s:X-1-2]]\n\nThe slide is right.");
    expect(plainSlideTalk("<general>\nI'll check this with the calculator.\n</general>\nNext.")).toBe("Next.");
  });
  it("drops announcing sentences anywhere", () => {
    expect(plainSlideTalk("The rate falls. I'll work this through with the calculator. It is 3.54.")).toBe("The rate falls. It is 3.54.");
    expect(plainSlideTalk("Slide 26 next. Let me verify the slide's arithmetic. The rate is 1.24.")).toBe("Slide 26 next. The rate is 1.24.");
    expect(plainSlideTalk("So P = 1.4 atm. I'll run that calculation for you.\nDone.").replace(/[ \t]+\n/g, "\n")).toBe("So P = 1.4 atm.\nDone.");
  });
  it("drops the model correcting itself", () => {
    expect(plainSlideTalk("That gives 148.11. Wait, I need to correct the 2024 step: 2024 is t = 11, so I should recompute that. Using t = 11 gives 155.91.")).toBe("That gives 148.11. Using t = 11 gives 155.91.");
  });
  it("keeps the result and drops the tool", () => {
    expect(plainSlideTalk("The tool confirms both values: 0.81 and 0.54 mol L⁻¹ s⁻¹.")).toBe("This gives both values: 0.81 and 0.54 mol L⁻¹ s⁻¹.");
    expect(plainSlideTalk("Using it, the calculator gives 3.5376.")).toBe("Using it, this gives 3.5376.");
  });
  it("leaves ordinary teaching alone", () => {
    const t = "Check your answer against slide 4: the four letters must match. Then work through the next example.";
    expect(plainSlideTalk(t)).toBe(t);
  });
});

describe("next slide", () => {
  it("is one slide, not the rest of the deck", () => {
    for (const m of ["Next slide pls", "next slide", "Next page please"]) {
      expect(asksForNextSlide(m)).toBe(true);
      expect(isContinuation(m)).toBe(true);
    }
    for (const m of ["next slides", "go through the next slides", "keep going", "explain the rest of the slides"]) expect(asksForNextSlide(m)).toBe(false);
  });
});

describe("instructions", () => {
  it("never tell the bot to call a slide wrong", () => {
    for (const t of [TURN_REMINDER, CALCULATION_RULES]) {
      expect(t).not.toMatch(/say plainly where it goes wrong|Check this with your lecturer\./);
    }
    expect(TURN_REMINDER).toMatch(/Never call a slide wrong, a typo, a slip or an error/);
    expect(CALCULATION_RULES).toMatch(/never "some sources describe this differently" for a calculation/);
  });
  it("never invent the student's name, and blank it in documents", () => {
    const p = partnerContext(null, "osasereee");
    expect(p).toMatch(/Never invent a name, surname/);
    expect(p).toMatch(/\[Your name\]/);
  });
  it("uses the full name from a firstname.lastname email for documents", async () => {
    const { nameFromEmail } = await import("@/lib/agent/student-name");
    expect(nameFromEmail("osasere.eboigbe@pau.edu.ng")).toBe("Osasere Eboigbe");
    expect(nameFromEmail("Chiamaka.Okonkwo-Eze@PAU.edu.ng")).toBe("Chiamaka Okonkwo-Eze");
    expect(nameFromEmail("ada.mary.obi@pau.edu.ng")).toBe("Ada Mary Obi");
    for (const e of ["behaviour-check-x-1764150000000@pau.edu.ng", "tolu@pau.edu.ng", "tolu.ade@gmail.com", "tolu.ade2@pau.edu.ng", null]) expect(nameFromEmail(e)).toBeNull();
    const p = partnerContext(null, "Tee", "Osasere Eboigbe");
    expect(p).toMatch(/full name, from their university email, is Osasere Eboigbe/);
    expect(p).toMatch(/in chat keep to the name above/);
    expect(p).toMatch(/\[Matric number\]/);
    expect(p).not.toMatch(/\[Your name\]/);
  });
});
