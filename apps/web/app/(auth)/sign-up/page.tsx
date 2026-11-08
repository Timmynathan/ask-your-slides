import type { Metadata } from "next";
import { AuthPage } from "../sign-in/page";

export const metadata: Metadata = { title: "Create your account · Ask Your Slides" };

// "Try for free" lands here: the same page as /sign-in, opened on Create account.
export default function SignUpPage(props: { searchParams: Promise<{ next?: string; ms?: string }> }) {
  return <AuthPage searchParams={props.searchParams} signUp />;
}
