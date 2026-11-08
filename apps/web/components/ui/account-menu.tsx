"use client";

// Avatar button (the student's initial) with their name, email, Sign out and Delete account. Used on My courses and
// in the study workspace.
import { useRef, useState } from "react";
import { useClickAway } from "@/lib/ui/use-click-away";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { SignOutButton } from "./sign-out-button";

export function AccountMenu({ user }: { user: { email: string; displayName: string | null } }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useClickAway(root, open, () => setOpen(false));
  const name = user.displayName ?? user.email;
  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account"
        aria-expanded={open}
        className="grid h-10 w-10 place-items-center rounded-full bg-brand text-[17px] font-medium uppercase text-brand-ink transition hover:opacity-90 active:scale-90"
      >
        {name.trim().charAt(0) || "?"}
      </button>
      {open && (
        <div className="pop-in absolute right-0 top-12 z-30 w-64 rounded-2xl bg-card p-4 text-sm shadow-lg ring-1 ring-line">
          {user.displayName && <p className="truncate font-medium text-ink">{user.displayName}</p>}
          <p className="truncate text-muted">{user.email}</p>
          <div className="mt-3 border-t border-line pt-3">
            <SignOutButton className="text-ink hover:underline" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setDeleting(true);
              }}
              className="mt-2 block px-1 text-left text-red-700 hover:underline"
            >
              Delete account
            </button>
          </div>
        </div>
      )}
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
    </div>
  );
}
