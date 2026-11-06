import type { MetadataRoute } from "next";

/** Personal app: only the sign-in page may be indexed; everything else is private. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/login"], disallow: ["/"] }],
  };
}
