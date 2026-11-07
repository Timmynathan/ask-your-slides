"use client";

import { useState } from "react";
import { Spinner } from "./spinner";

/** Plain form POST (works without JS); shows a spinner and blocks repeat clicks while it runs. */
export function SignOutButton({ className = "" }: { className?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <form action="/api/auth/sign-out" method="post" onSubmit={(e) => (pending ? e.preventDefault() : setPending(true))}>
      <button disabled={pending} className={`inline-flex items-center gap-1.5 rounded px-1 ${className}`}>
        {pending && <Spinner className="h-3 w-3" />}
        {pending ? "Signing out…" : "Sign out"}
      </button>
    </form>
  );
}
