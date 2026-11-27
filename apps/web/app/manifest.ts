import type { MetadataRoute } from "next";

// Name and icons for phones and bookmarks. Not installable (owner, 27 Nov 2026: no "Add to Home screen" /
// "Install app" prompt on mobile): display "browser" means Chrome doesn't offer to install it.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ask Your Slides",
    short_name: "Ask Your Slides",
    description: "Answers straight from your school slides, explained by a study partner you choose.",
    start_url: "/dashboard",
    display: "browser",
    background_color: "#f7f6ef",
    theme_color: "#f7f6ef",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
