import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Mascot } from "@/components/mascot/mascot";
import { directSignupEnabled } from "@/lib/auth/signup-mode";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Ask Your Slides" };

type Props = { signUp?: boolean };

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
          <SignInForm startWithCode={props.signUp} directSignup={directSignupEnabled()} />
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

export default function SignInPage() {
  return <AuthPage />;
}
