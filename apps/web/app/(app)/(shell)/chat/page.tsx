import { redirect } from "next/navigation";

// The separate Chat page was folded into "Ask anything" on the dashboard (owner, 21 Nov 2026):
// questions open in the right course's chat. Old links land there.
export default function ChatPage() {
  redirect("/dashboard");
}
