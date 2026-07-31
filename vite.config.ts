// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// When building the offline Electron desktop app we emit a static SPA shell
// (dist/client/index.html) so the renderer can boot from file:// with no server.
const isElectron = process.env.ELECTRON_BUILD === "1";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    ...(isElectron
      ? { spa: { enabled: true, prerender: { outputPath: "/index.html" } } }
      : {}),
  },
  // Relative base so the Electron shell can load built assets via file://
  vite: { base: "./" },
});
