import type { MetadataRoute } from "next";
import { uz } from "@/lib/i18n/uz";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: uz.app.name,
    short_name: uz.app.short,
    description: uz.app.description,
    lang: "uz",
    start_url: "/bugun",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbfcfe",
    theme_color: "#4655c4",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Takrorlashni boshlash", url: "/bugun" },
      { name: "So'z qo'shish", url: "/qoshish" },
    ],
  };
}
