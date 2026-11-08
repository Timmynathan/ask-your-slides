import Link from "next/link";

/** PAU-navy announcement bar across the top (layout: studyfetch.com). */
export function Banner({ text, linkText, href }: { text: string; linkText: string; href: string }) {
  return (
    <div className="relative flex w-full items-center justify-center gap-3 bg-navy px-4 py-2.5 text-center text-xs text-white sm:text-sm">
      <span>{text}</span>
      <Link href={href} className="whitespace-nowrap font-semibold text-white underline underline-offset-4 hover:text-pau-400">
        {linkText} →
      </Link>
    </div>
  );
}
