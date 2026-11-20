"use client";

// The Chat page: the general chat full size. Phones get the sidebar's menu button above it; "Change
// character" opens Your profile, where the study partner is chosen.
import { useRouter } from "next/navigation";
import { ShellMenuButton } from "@/components/nav/app-shell";
import type { PartnerId } from "@/lib/partners";
import { GeneralChatPanel } from "./general-chat-panel";

export function ChatPage({ partner, firstName }: { partner: PartnerId; firstName: string | null }) {
  const router = useRouter();
  return (
    <div className="relative">
      <div className="absolute left-3 top-3 z-30 md:hidden">
        <ShellMenuButton />
      </div>
      <GeneralChatPanel variant="page" partner={partner} firstName={firstName} onChangePartner={() => router.push("/profile")} />
    </div>
  );
}
