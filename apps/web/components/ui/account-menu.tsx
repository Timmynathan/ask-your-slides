"use client";

// Avatar button (the student's initial) with a short menu (owner, 20 Nov 2026): Your profile (name,
// programme, study partner, all editable), Settings (plan, sign out, delete account), Give us
// feedback, Plans and pricing, and Support (the owner's WhatsApp). Sign out and Delete account live
// in Settings, not here, so they aren't one tap away. Used on My courses, Past questions, the study
// workspace and the admin page.
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { CircleHelp, CreditCard, PencilLine, Settings, UserRound, type LucideIcon } from "lucide-react";
import { FeedbackDialog } from "@/components/nav/feedback-dialog";
import { WHATSAPP_NUMBER } from "@/lib/plans/config";
import { useClickAway } from "@/lib/ui/use-click-away";

function Row({ icon: Icon, children, href, onClick, external = false }: { icon: LucideIcon; children: ReactNode; href?: string; onClick?(): void; external?: boolean }) {
  const cls = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] text-ink transition hover:bg-sunken";
  const inner = (
    <>
      <Icon size={20} absoluteStrokeWidth strokeWidth={1.5} className="shrink-0 text-ink" aria-hidden />
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
            <Row href="/profile" onClick={close} icon={UserRound}>
              Your profile
            </Row>
            <Row
              href="/settings"
              onClick={close}
              icon={Settings}
            >
              Settings
            </Row>
            <Row
              onClick={() => {
                close();
                setFeedback(true);
              }}
              icon={PencilLine}
            >
              Give us feedback
            </Row>
            <Row href="/pricing" onClick={close} icon={CreditCard}>
              Plans and pricing
            </Row>
            <Row
              href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hi, I need help with Ask Your Slides.")}`}
              external
              onClick={close}
              icon={CircleHelp}
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
