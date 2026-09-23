// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// GitHub Pages only serves static files, so the Pages workflow builds a client-only SPA:
// no server bundle (nitro off), and every route is served from a prerendered HTML shell.
// BASE_PATH is the repository sub-path, e.g. "/treino/". Other builds (Lovable) are unchanged.
const githubPages = process.env["GITHUB_PAGES"] === "true";
const basePath = process.env["BASE_PATH"] ?? "/";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // In SPA mode the router basepath is derived from `base` below.
    ...(githubPages ? { spa: { enabled: true } } : {}),
  },
  ...(githubPages ? { nitro: false as const, vite: { base: basePath } } : {}),
});
