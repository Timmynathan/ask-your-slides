import Link from "next/link";

/** Light PAU-blue announcement bar across the top (layout: studyfetch.com; colour: pau.edu.ng). */
export function Banner({ text, linkText, href }: { text: string; linkText: string; href: string }) {
  return (
    <div className="relative flex w-full items-center justify-center gap-3 bg-pau-100 px-4 py-2.5 text-center text-xs text-pau-900 sm:text-sm">
      <span>{text}</span>
      <Link href={href} className="whitespace-nowrap font-semibold text-pau-800 underline-offset-4 hover:underline">
        {linkText} →
      </Link>
    </div>
  );
}
