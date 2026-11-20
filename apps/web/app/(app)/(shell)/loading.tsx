import { ContentSkeleton } from "@/components/nav/content-skeleton";

// Shown in the content area while one of the sidebar pages loads; the sidebar itself stays.
export default function Loading() {
  return <ContentSkeleton />;
}
