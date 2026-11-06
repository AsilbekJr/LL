import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { uz } from "@/lib/i18n/uz";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: uz.app.name, template: `%s · ${uz.app.short}` },
  description: uz.app.description,
  applicationName: uz.app.short,
  appleWebApp: { capable: true, title: uz.app.short, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // enables env(safe-area-inset-*)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfcfe" },
    { media: "(prefers-color-scheme: dark)", color: "#13151f" },
  ],
};

// Runs before paint: system theme by default, optional saved override ("light" | "dark").
const themeScript = `(function(){try{var t=localStorage.getItem('ll-theme');var m=window.matchMedia('(prefers-color-scheme: dark)');function a(){var d=t==='dark'||(t!=='light'&&m.matches);document.documentElement.classList.toggle('dark',d);}a();m.addEventListener('change',a);}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
