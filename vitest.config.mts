import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    // fileURLToPath, not URL.pathname: on Windows the pathname comes out as "/C:/...",
    // which is not a path, and every "@/" import would fail there and nowhere else.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
})
