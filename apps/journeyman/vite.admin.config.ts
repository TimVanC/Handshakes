import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "admin",
  plugins: [react()],
  server: {
    port:
      Number(
        (globalThis as { process?: { env: Record<string, string | undefined> } })
          .process?.env.PORT
      ) || 5174,
  },
  build: {
    outDir: "../dist-admin",
    emptyOutDir: true,
  },
});
