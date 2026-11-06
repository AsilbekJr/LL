import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // Run tests in a timezone that is NOT Tashkent, to prove day logic never depends on the host TZ.
    env: { TZ: "America/New_York" },
    coverage: { include: ["src/lib/**"], reporter: ["text", "html"] },
  },
});
