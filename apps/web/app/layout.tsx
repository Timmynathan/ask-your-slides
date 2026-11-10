import type { Metadata, Viewport } from "next";
import { Bitter, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Haptics } from "@/components/ui/haptics";

// Type system (reference: studyfetch.com): Bitter for headings, Inter for text, JetBrains Mono for code.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const bitter = Bitter({ variable: "--font-bitter", subsets: ["latin"], weight: ["500", "600", "700"], style: ["normal", "italic"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

// Light only: browsers don't switch the page, form fields or the address bar to dark.
export const viewport: Viewport = { colorScheme: "light", themeColor: "#ffffff" };

export const metadata: Metadata = {
  title: "Ask Your Slides",
  description: "Stop uploading slides to ChatGPT. All your course slides are already here: no uploads, no screenshots, answers straight from your slides with the exact slide shown."
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${bitter.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-page text-ink">
        <Haptics />
        {children}
      </body>
    </html>
  );
}
