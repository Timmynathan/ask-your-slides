import { redirect } from "next/navigation";

// The all-courses past questions page was retired (owner, 22 Nov 2026): nothing linked to it any more.
// Past questions live in each course (the Past questions card in the course panel). Old links land on
// the dashboard.
export default function PastQuestionsPage() {
  redirect("/dashboard");
}
