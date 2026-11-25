import { redirect } from "next/navigation";

// The emails page is now the dashboard's Emails tab (owner, 25 Nov 2026); old links land there.
export default function AdminEmailsPage() {
  redirect("/admin?tab=emails");
}
