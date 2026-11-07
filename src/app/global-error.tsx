"use client";

import { useEffect } from "react";
import { reloadForStaleBuild } from "@/lib/app/stale-build";

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it cannot rely on the app's providers or styles.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (reloadForStaleBuild(error)) return;
    console.error(error);
  }, [error]);

  return (
    <html lang="uz">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#faf8f3",
          color: "#1d1e2c",
          padding: 24,
          textAlign: "center",
        }}
      >
        <main>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Xatolik yuz berdi</h1>
          <p style={{ margin: "0 0 20px", opacity: 0.75 }}>
            Ilova kutilmaganda to&apos;xtadi. Sahifani yangilang — saqlanmagan javoblaringiz telefonda turibdi
            va keyin yuboriladi.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              font: "inherit",
              fontWeight: 600,
              padding: "10px 18px",
              borderRadius: 12,
              border: 0,
              background: "#3b3fd8",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Sahifani yangilash
          </button>
        </main>
      </body>
    </html>
  );
}
