import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { getHudsonThemeScript } from "hudsonkit/theme-script";
import { defineConfig } from "vite";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Static build of Studio's own studio, mounted at hudsonkit.com/studio.
//   bun run build:site   → apps/studio/site/dist
export default defineConfig({
  root: at("."),
  base: "/studio/",
  plugins: [
    react(),
    {
      name: "studio-site-theme-script",
      transformIndexHtml: (html) =>
        html.replace(
          "%HUDSON_THEME_SCRIPT%",
          getHudsonThemeScript({ storageKey: "studio.theme", defaultTheme: "dark", defaultTemplate: "hudson" }),
        ),
    },
  ],
  resolve: {
    alias: [
      // Annotation pass without the host-backed persistence and Scout dispatch.
      { find: "@/studio/AnnotatableMarkdown", replacement: at("./StaticMarkdown.tsx") },
      { find: /^@\//, replacement: `${at("../src")}/` },
    ],
  },
  css: { postcss: at("..") },
  build: { outDir: at("./dist"), emptyOutDir: true },
});
