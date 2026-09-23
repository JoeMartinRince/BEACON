import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
  server: {
    watch: {
      ignored: ["**/data/**", "**/*.csv", "**/.git/**"],
    },
  },
  plugins: [
    tanstackStart({
      server: { entry: "server" },
      prerender: {
        enabled: true,
      },
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
