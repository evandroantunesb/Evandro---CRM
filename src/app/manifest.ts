import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Raion CRM",
    short_name: "Raion",
    description: "CRM para negócios que vão mais longe.",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#FAF8F3",
    theme_color: "#0F0F10",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
