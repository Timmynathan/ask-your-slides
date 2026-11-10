import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

// Also what a student sees for a course outside their programme (PRD F11: the database doesn't
// return it, so it simply doesn't exist for them).
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-page px-6 text-center">
      <div>
        <LogoMark size={36} />
        <h1 className="mt-5 font-heading text-3xl font-semibold tracking-tight text-ink">Page not found</h1>
        <p className="mx-auto mt-2 max-w-sm text-muted">This page doesn&apos;t exist, or the course isn&apos;t part of your programme.</p>
        <Link href="/dashboard" className="mt-6 inline-block rounded-full bg-brand px-6 py-3 text-sm font-medium text-brand-ink hover:opacity-90">
          Go to My courses
        </Link>
      </div>
    </main>
  );
}
