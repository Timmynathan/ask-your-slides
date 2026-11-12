// Free vs Finals, one row per feature (check / lock icons). A real table on wider screens; on
// phones each row becomes a small card (feature, then Free and Finals side by side), so nothing
// scrolls sideways.
import { comparisonRows, type PlanOffer } from "@/lib/plans/offer";
import { CheckIcon, LockIcon } from "./plan-cards";

function Cell({ value, plan }: { value: string | boolean; plan: string }) {
  if (value === true) return <CheckIcon label={`Included on ${plan}`} />;
  if (value === false) return <LockIcon label={`Not on ${plan}`} />;
  return <span className="text-[14px] text-ink">{value}</span>;
}

export function CompareTable({ offer }: { offer: PlanOffer }) {
  const rows = comparisonRows(offer);
  return (
    <div className="mx-auto max-w-4xl">
      {/* Wider screens: a table. */}
      <table className="hidden w-full overflow-hidden rounded-[25px] bg-card text-left ring-1 ring-line sm:table">
        <caption className="sr-only">Free and Finals compared</caption>
        <thead>
          <tr className="border-b border-line text-sm text-muted">
            <th scope="col" className="px-6 py-4 font-medium">Feature</th>
            <th scope="col" className="w-[30%] px-6 py-4 font-medium">Free</th>
            <th scope="col" className="w-[30%] px-6 py-4 font-semibold text-ink">Finals</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-line last:border-0">
              <th scope="row" className="px-6 py-3.5 text-[14px] font-normal text-muted">{r.label}</th>
              <td className="px-6 py-3.5"><Cell value={r.free} plan="Free" /></td>
              <td className="bg-pau-50/60 px-6 py-3.5 dark:bg-white/[0.03]"><Cell value={r.finals} plan="Finals" /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Phones: one small card per feature. */}
      <dl className="space-y-2 sm:hidden">
        {rows.map((r) => (
          <div key={r.label} className="rounded-2xl bg-card px-4 py-3 ring-1 ring-line">
            <dt className="text-[13px] text-muted">{r.label}</dt>
            <dd className="mt-1.5 grid grid-cols-2 gap-3">
              <span className="flex items-start gap-2">
                <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Free</span>
                <Cell value={r.free} plan="Free" />
              </span>
              <span className="flex items-start gap-2">
                <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand dark:text-pau-400">Finals</span>
                <Cell value={r.finals} plan="Finals" />
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
