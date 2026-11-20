import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Mascot } from "@/components/mascot/mascot";
import { directSignupEnabled } from "@/lib/auth/signup-mode";
import { SignInForm } from "./sign-in-form";
import { AuthAside } from "@/components/auth/auth-aside";

export const metadata: Metadata = { title: "Sign in · Ask Your Slides" };

type Props = { signUp?: boolean };

/** Shared by /sign-in (Log in) and /sign-up (Create account): same page, different first tab. */
export function AuthPage(props: Props) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <main className="flex flex-col bg-[#f4f6fa] px-5 py-6 sm:px-10">
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
      <AuthAside signUp={!!props.signUp} />
    </div>
  );
}

export default function SignInPage() {
  return <AuthPage />;
}
