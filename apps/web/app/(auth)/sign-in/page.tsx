import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { Mascot } from "@/components/mascot/mascot";
import { safeNext } from "@/lib/auth/next";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Ask Your Slides" };

type Props = { searchParams: Promise<{ start?: string; next?: string; deleted?: string; error?: string; ms?: string }>; signUp?: boolean };

const SIGN_IN_ERRORS: Record<string, string> = {
  microsoft: "Microsoft sign-in didn't finish. Try again, or use your email below.",
  not_pau: "That Microsoft account isn't a PAU account. Use your @pau.edu.ng account.",
};

async function Form({ searchParams, signUp = false }: Props) {
  const { start, next, deleted, error, ms } = await searchParams;
  return (
    <>
      {deleted === "1" && (
        <p role="status" className="mb-6 rounded-2xl bg-sunken px-4 py-3 text-sm text-ink">
          Your account has been deleted. You can sign up again any time.
        </p>
      )}
      {error && SIGN_IN_ERRORS[error] && (
        <p role="alert" className="mb-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-400/10 dark:text-red-300">
          {SIGN_IN_ERRORS[error]}
        </p>
      )}
      <SignInForm startWithCode={signUp || start === "1"} next={safeNext(next)} microsoft={ms === "1"} />
    </>
  );
}

/** Shared by /sign-in (Log in) and /sign-up (Create account): same page, different first tab. */
export function AuthPage(props: Props) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <main className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" className="w-fit" aria-label="Ask Your Slides home">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <div className="mb-6 flex -space-x-3 lg:hidden" aria-hidden>
            <Mascot partner="tobi" size={44} />
            <Mascot partner="ada" size={44} />
            <Mascot partner="musa" size={44} />
          </div>
          <Suspense fallback={<div className="mt-8 h-64" />}>
            <Form {...props} />
          </Suspense>
        </div>
      </main>
      <aside className="relative hidden overflow-hidden bg-pau-100 lg:flex lg:flex-col lg:items-center lg:justify-center" aria-hidden>
        <div className="relative">
          <div className="pop-in rounded-[22px] bg-white px-5 py-4 text-[15px] text-[#191919] shadow-lg">
            {props.signUp ? "Welcome! You're one minute away from your slides." : "Log in and let's pick up where you stopped."}
            <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 bg-white" />
          </div>
        </div>
        <div className="mt-6">
          <Mascot partner="ada" size={190} mood="happy" />
        </div>
        <div className="float-y absolute left-[12%] top-[18%]">
          <Mascot partner="tobi" size={96} />
        </div>
        <div className="float-y absolute bottom-[14%] right-[12%]" style={{ animationDelay: "1.4s" }}>
          <Mascot partner="musa" size={104} />
        </div>
      </aside>
    </div>
  );
}

export default function SignInPage(props: Props) {
  return <AuthPage {...props} />;
}
