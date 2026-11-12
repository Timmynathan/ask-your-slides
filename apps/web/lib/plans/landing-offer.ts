import "server-only";
import { cacheLife } from "next/cache";
import { planOffer, type PlanOffer } from "./offer";

/** The plan offer for the prerendered landing page, refreshed every few minutes. The price
 *  component re-reads the clock in the browser, so the switch to the full price is on time even
 *  when this copy is a few minutes old. */
export async function landingOffer(): Promise<PlanOffer> {
  "use cache";
  cacheLife("minutes");
  return planOffer(new Date());
}
