// Plans on screen (PRD F12, phase 3): the landing section and the pricing page show the price the
// server charges (₦3,000 before PRICE_CHANGE_DATE, ₦5,000 after) and the limits it enforces, all
// read from lib/plans/config.ts; nothing is typed into the components.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlansSection } from "@/components/landing/plans-section";
import { PlanCards } from "@/components/plans/plan-cards";
import { FINALS_PRICE, FINALS_PRICE_EARLY, PRICE_CHANGE_DATE } from "@/lib/plans/config";
import { finalsPrice } from "@/lib/plans/limits";
import { comparisonRows, planOffer, timeLeft } from "@/lib/plans/offer";

const BEFORE = new Date("2026-11-16T12:00:00+01:00");
const AFTER = new Date(PRICE_CHANGE_DATE.getTime() + 1000);
const landing = (now: Date) => renderToStaticMarkup(createElement(PlansSection, { offer: planOffer(now) }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("plan offer = what the server charges", () => {
  it("before PRICE_CHANGE_DATE: ₦3,000 everywhere, with the full price and the date", () => {
    const o = planOffer(BEFORE);
    expect(o).toMatchObject({ price: 3000, early: true, earlyPrice: 3000, fullPrice: 5000, priceChangeLabel: "22 Nov" });
    expect(o.price).toBe(finalsPrice(BEFORE)); // the checkout route uses finalsPrice
    const t = text(landing(BEFORE));
    expect(t).toContain("₦3,000");
    expect(t).toMatch(/<s|₦5,000/); // struck-through full price
    expect(t).toContain("₦3,000 until 22 Nov, then ₦5,000");
  });

  it("after PRICE_CHANGE_DATE: ₦5,000 only, no early price, no countdown", () => {
    const o = planOffer(AFTER);
    expect(o).toMatchObject({ price: 5000, early: false });
    expect(o.price).toBe(finalsPrice(AFTER));
    const t = text(landing(AFTER));
    expect(t).toContain("₦5,000");
    expect(t).not.toContain("₦3,000");
    expect(t).not.toContain("Price goes up");
  });

  it("the in-app pricing cards show the same price", () => {
    const html = (now: Date) => text(renderToStaticMarkup(createElement(PlanCards, { offer: planOffer(now), freeAction: null, finalsAction: null })));
    expect(html(BEFORE)).toContain("₦3,000");
    expect(html(AFTER)).toContain("₦5,000");
    expect(html(AFTER)).not.toContain("₦3,000");
  });

  it("countdown wording", () => {
    const at = PRICE_CHANGE_DATE.getTime();
    expect(timeLeft(PRICE_CHANGE_DATE.toISOString(), at - (2 * 24 + 4) * 3600_000 - 60_000)).toBe("2d 4h");
    expect(timeLeft(PRICE_CHANGE_DATE.toISOString(), at - 5 * 3600_000 - 12 * 60_000)).toBe("5h 12m");
    expect(timeLeft(PRICE_CHANGE_DATE.toISOString(), at)).toBeNull();
  });
});

describe("landing Plans section", () => {
  const t = text(landing(BEFORE));
  it("has the spec's wording, buttons and comparison rows", () => {
    for (const s of [
      "Free forever",
      "₦0",
      "Valid until your last paper",
      "All your courses, no limits",
      "Unlimited summaries and quiz mode",
      "20 messages on your first day, then 5 a day",
      "Premium courses: 2 questions a day",
      "1 summary",
      "Start free",
      "Lock in Finals · ₦3,000",
      "Goes up to ₦5,000 after 22 Nov",
      "One-time payment. No subscription. Pay by bank transfer.",
      "Premium courses are the heaviest courses in your programme.",
    ]) {
      expect(t, s).toContain(s);
    }
    expect(comparisonRows(planOffer(BEFORE))).toEqual([
      { label: "Daily messages", free: "20 on day one, then 5 a day", finals: "40 a day" },
      { label: "All your courses", free: true, finals: true },
      { label: "Premium courses", free: "2 questions a day", finals: "Unlimited" },
      { label: "Answers cite your actual slides", free: true, finals: true },
      { label: "Summaries", free: "1", finals: "Unlimited" },
      { label: "Quiz mode", free: false, finals: true },
      { label: "Valid", free: "Forever", finals: "Until your last paper" },
    ]);
  });

  it("Get Finals goes to sign-up, then straight to the payment page", () => {
    expect(landing(BEFORE)).toContain(`href="/sign-up?next=${encodeURIComponent("/pay")}"`);
  });

  it("is accessible: a real heading, labelled icons", () => {
    const html = landing(BEFORE);
    expect(html).toMatch(/<h2[^>]*id="plans-title"[^>]*>Plans<\/h2>/);
    expect(html).toContain('aria-label="Not on Free"'); // quiz mode lock
    expect(html).toContain('aria-label="Included on Finals"');
  });
});

describe("no plan figures typed into the UI", () => {
  it("prices and limits come from the config only", () => {
    const files = [
      ...readdirSync(path.resolve("components/plans")).map((f) => path.join("components/plans", f)),
      "components/landing/plans-section.tsx",
      "app/(app)/pricing/page.tsx",
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
