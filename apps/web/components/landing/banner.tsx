import Link from "next/link";

/** Lilac announcement bar across the top (reference: studyfetch.com). */
export function Banner({ text, linkText, href }: { text: string; linkText: string; href: string }) {
  return (
    <div className="relative flex w-full items-center justify-center gap-3 bg-[#F5D5FF] px-4 py-2.5 text-center text-xs text-[#191919] sm:text-sm">
      <span>{text}</span>
      <Link href={href} className="whitespace-nowrap font-medium text-blue-700 hover:underline">
        {linkText} →
      </Link>
    </div>
  );
}
