import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · PAU Study Assistant" };

export default function SignInPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">PAU Study Assistant</h1>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Ask questions about your final-year CS lecture slides.
      </p>
      <SignInForm />
      <PrivacyNotice />
    </main>
  );
}

function PrivacyNotice() {
  const contact = process.env.NEXT_PUBLIC_PRIVACY_CONTACT;
  return (
    <section className="mt-8 rounded-lg border border-neutral-200 p-3 text-xs leading-relaxed text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
      <h2 className="mb-1 font-medium text-neutral-800 dark:text-neutral-200">What we store</h2>
      <p>
        Your PAU email, an optional display name, and your conversations. Conversations and ratings
        are used to improve the app. Your data is never sold or used to train AI models.
      </p>
      <p className="mt-1">
        To have your data deleted,{" "}
        {contact ? (
          <>
            email <a className="underline" href={`mailto:${contact}`}>{contact}</a>
          </>
        ) : (
          "contact the app owner"
        )}
        .
      </p>
    </section>
  );
}
