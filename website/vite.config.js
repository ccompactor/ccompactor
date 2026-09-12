import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The site is served from https://handyutils.github.io/sctxx, so every asset
// URL must be prefixed with the repository name.
export default defineConfig({
  base: "/sctxx/",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
