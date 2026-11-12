"use client";

// Avatar button (the student's initial) with their name, email, Sign out and Delete account. Used on My courses and
// in the study workspace.
import Link from "next/link";
import { useRef, useState } from "react";
import { useClickAway } from "@/lib/ui/use-click-away";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { ProgrammeDialog } from "./programme-dialog";
import { SignOutButton } from "./sign-out-button";

export function AccountMenu({ user, onChangePartner }: { user: { email: string; displayName: string | null }; onChangePartner?: () => void }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [changing, setChanging] = useState(false);
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
            {onChangePartner && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onChangePartner();
                }}
                className="mb-2 block px-1 text-left text-ink hover:underline"
              >
                Change study partner
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setChanging(true);
              }}
              className="mb-2 block px-1 text-left text-ink hover:underline"
            >
              Change programme
            </button>
            <Link href="/pricing" onClick={() => setOpen(false)} className="mb-2 block px-1 text-left text-ink hover:underline">
              Plans and pricing
            </Link>
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
      {changing && <ProgrammeDialog onClose={() => setChanging(false)} />}
    </div>
  );
}
