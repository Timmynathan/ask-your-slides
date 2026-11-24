// Plans on screen (PRD F12, phase 3): the plan view (onboarding, the Upgrade pop-up, /pricing) shows the price the
// server charges (₦3,000 before PRICE_CHANGE_DATE, ₦5,000 after) and the limits it enforces, all
// read from lib/plans/config.ts; nothing is typed into the components.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanOfferPanel } from "@/components/onboarding/plan-step";
import { FINALS_PRICE, FINALS_PRICE_EARLY, PRICE_CHANGE_DATE } from "@/lib/plans/config";
import { finalsPrice } from "@/lib/plans/limits";
import { planOffer, timeLeft } from "@/lib/plans/offer";

const BEFORE = new Date("2026-11-16T12:00:00+01:00");
const AFTER = new Date(PRICE_CHANGE_DATE.getTime() + 1000);
const panel = (now: Date) => renderToStaticMarkup(createElement(PlanOfferPanel, { offer: { ...planOffer(now), paymentsOpen: true }, freePast: false, promo: null }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("plan offer = what the server charges", () => {
  it("before PRICE_CHANGE_DATE: ₦3,000 everywhere, with the full price and the date", () => {
    const o = planOffer(BEFORE);
    expect(o).toMatchObject({ price: 3000, early: true, earlyPrice: 3000, fullPrice: 5000, priceChangeLabel: "27 Nov" });
    expect(o.price).toBe(finalsPrice(BEFORE)); // the checkout route uses finalsPrice
    const t = text(panel(BEFORE));
    expect(t).toContain("₦3,000");
    expect(t).toContain("₦5,000"); // struck-through full price
  });

  it("after PRICE_CHANGE_DATE: ₦5,000 only, no early price, no countdown", () => {
    const o = planOffer(AFTER);
    expect(o).toMatchObject({ price: 5000, early: false });
    expect(o.price).toBe(finalsPrice(AFTER));
    const t = text(panel(AFTER));
    expect(t).toContain("₦5,000");
    expect(t).not.toContain("₦3,000");
  });

  it("the plan view has no comparison table on the page (owner, 24 Nov 2026)", () => {
    const html = panel(BEFORE);
    expect(html).not.toContain("<table");
    expect(text(html)).toContain("Get Finals");
  });

  it("countdown wording", () => {
    const at = PRICE_CHANGE_DATE.getTime();
    expect(timeLeft(PRICE_CHANGE_DATE.toISOString(), at - (2 * 24 + 4) * 3600_000 - 60_000)).toBe("2d 4h");
    expect(timeLeft(PRICE_CHANGE_DATE.toISOString(), at - 5 * 3600_000 - 12 * 60_000)).toBe("5h 12m");
    expect(timeLeft(PRICE_CHANGE_DATE.toISOString(), at)).toBeNull();
  });
});

describe("no plan figures typed into the UI", () => {
  it("prices and limits come from the config only", () => {
    const files = [
      ...readdirSync(path.resolve("components/plans")).map((f) => path.join("components/plans", f)),
      "components/onboarding/plan-step.tsx",
      "app/(app)/(shell)/pricing/page.tsx",
      "app/(app)/pay/page.tsx",
    ];
    for (const f of files) {
      const src = readFileSync(path.resolve(f), "utf8");
      expect(src, f).not.toMatch(/₦\s?\d|\b[35],000\b|\b[35]000\b/);
      expect(src, f).not.toMatch(/\b(20|40) (messages|a day)|\b5 a day|2 questions/);
    }
    expect([FINALS_PRICE_EARLY, FINALS_PRICE]).toEqual([3000, 5000]);
  });
});
