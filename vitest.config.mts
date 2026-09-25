import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    // Lê o .env.local (valores do Supabase local).
    env: loadEnv("development", process.cwd(), ""),
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
