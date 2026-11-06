import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Microphone is needed for speaking stages (SpeechRecognition).
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // radix-ui is one barrel package: import only the primitives a page uses.
  experimental: { optimizePackageImports: ["radix-ui"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Serwist (service worker) needs the webpack build — hence `next build --webpack`.
// In dev the plugin is not applied at all: even when disabled it injects a
// `webpack` config, which makes `next dev` (Turbopack by default) refuse to
// start. Skipping it in dev also keeps hot reload out of the SW cache.
function withServiceWorker(config: NextConfig): NextConfig {
  if (process.env.NODE_ENV === "development") return config;
  return withSerwistInit({
    swSrc: "src/app/sw.ts",
    swDest: "public/sw.js",
    cacheOnNavigation: true,
    reloadOnOnline: false,
  })(config);
}

export default withServiceWorker(nextConfig);
