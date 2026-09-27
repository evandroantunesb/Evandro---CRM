import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // O pacote real só funciona sob o bundler do Next.js (que define uma
      // condição especial de resolve); fora dele, ele sempre lança erro. Os
      // arquivos de PDF usam "server-only" como marcação — aqui vira um no-op.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Lê o .env.local (valores do Supabase local).
    env: loadEnv("development", process.cwd(), ""),
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
