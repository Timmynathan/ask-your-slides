"use client";

import { useFormStatus } from "react-dom";
import { BusyLabel } from "./spinner";

/** Submit + optional skip for a server-action form: both lock while it is saving. */
export function SaveButtons({ label, busyLabel, skipLabel }: { label: string; busyLabel: string; skipLabel?: string }) {
  const { pending, data } = useFormStatus();
  const skipping = pending && data?.get("skip") === "1";
  return (
    <>
      <button type="submit" disabled={pending}
        className="mt-4 w-full rounded-lg bg-neutral-900 px-3 py-2.5 font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
        <BusyLabel busy={pending && !skipping} label={label} busyLabel={busyLabel} />
      </button>
      {skipLabel && (
        <button type="submit" name="skip" value="1" disabled={pending}
          className="mt-3 w-full rounded text-sm text-neutral-600 underline hover:text-neutral-950 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-white">
          {skipping ? "Skipping…" : skipLabel}
        </button>
      )}
    </>
  );
}
