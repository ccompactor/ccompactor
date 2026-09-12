import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The site is served from https://ccompactor.github.io/, a user/organisation
// Pages site rather than a project subpath, so the base is the site root.
// Serving it under a repository subpath instead means changing this to
// "/<repo>/" — the asset imports in App.jsx and the favicon in index.html
// follow it.
export default defineConfig({
  base: "/",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
