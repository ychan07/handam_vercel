import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/admin/**/*.test.ts"], environment: "node" } });
