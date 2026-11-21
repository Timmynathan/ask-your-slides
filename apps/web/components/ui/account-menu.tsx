"use client";

// Avatar button (the student's initial) with a short menu (owner, 20 Nov 2026): Your profile (name,
// programme, study partner, all editable), Settings (plan, sign out, delete account), Give us
// feedback, Plans and pricing, and Support (the owner's WhatsApp). Sign out and Delete account live
// in Settings, not here, so they aren't one tap away. Used on My courses, Past questions, the study
// workspace and the admin page.
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { FeedbackDialog } from "@/components/nav/feedback-dialog";
import { WHATSAPP_NUMBER } from "@/lib/plans/config";
import { useClickAway } from "@/lib/ui/use-click-away";

function Row({ icon, children, href, onClick, external = false }: { icon: ReactNode; children: ReactNode; href?: string; onClick?(): void; external?: boolean }) {
  const cls = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] text-ink transition hover:bg-sunken";
  const inner = (
    <>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink" aria-hidden>
        {icon}
      </svg>
      {children}
    </>
  );
  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cls}>
        {inner}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} onClick={onClick} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** `side`: opened from the sidebar (a white button on navy; the menu opens to its right, upwards).
 *  `onChangePartner` is no longer used here (the partner is changed on the profile page); kept so
 *  callers don't break. */
export function AccountMenu({ user, side = false, menuClassName }: { user: { email: string; displayName: string | null }; onChangePartner?: () => void; side?: boolean; menuClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useClickAway(root, open, () => setOpen(false));
  const name = user.displayName ?? user.email;
  const close = () => setOpen(false);
  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account"
        aria-expanded={open}
        className={`grid h-10 w-10 place-items-center rounded-full text-[17px] font-medium uppercase transition hover:opacity-90 active:scale-90 ${side ? "bg-white text-brand" : "bg-brand text-brand-ink"}`}
      >
        {name.trim().charAt(0) || "?"}
      </button>
      {open && (
        <div className={`pop-in absolute z-30 w-64 rounded-2xl bg-card p-2 text-sm shadow-lg ring-1 ring-line ${menuClassName ?? (side ? "bottom-0 left-14" : "right-0 top-12")}`}>
          {/* No name or email at the top (owner, 21 Nov 2026): straight to the options. */}
          <div>
            <Row href="/profile" onClick={close} icon={<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0" />}>
              Your profile
            </Row>
            <Row
              href="/settings"
              onClick={close}
              icon={
                <>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
                </>
              }
            >
              Settings
            </Row>
            <Row
              onClick={() => {
                close();
                setFeedback(true);
              }}
              icon={<path d="M14.5 4.5l5 5L9 20H4v-5L14.5 4.5zM12.5 6.5l5 5" />}
            >
              Give us feedback
            </Row>
            <Row href="/pricing" onClick={close} icon={<path d="M3.5 6.5h17v11h-17zM3.5 10h17M7 14.5h4" />}>
              Plans and pricing
            </Row>
            <Row
              href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hi, I need help with Ask Your Slides.")}`}
              external
              onClick={close}
              icon={
                <>
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M9.6 9.5a2.4 2.4 0 1 1 3.4 2.2c-.6.3-1 .8-1 1.5v.3M12 16.8v.2" />
                </>
              }
            >
              Support
            </Row>
          </div>
        </div>
      )}
      {feedback && <FeedbackDialog onClose={() => setFeedback(false)} />}
    </div>
  );
}
