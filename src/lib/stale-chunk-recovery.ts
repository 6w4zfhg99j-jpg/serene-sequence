const KEY = "vona:stale-chunk-reload-at";
const WINDOW_MS = 10_000;

/** True when an error means the browser failed to load an outdated page module. */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Unable to preload CSS/i.test(
    message,
  );
}

/** Reloads the page once to fetch fresh modules; returns false if a reload just happened (avoids loops). */
export function reloadForStaleChunk(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < WINDOW_MS) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // storage unavailable: still try one reload
  }
  window.location.reload();
  return true;
}

let installed = false;
export function installStaleChunkRecovery() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForStaleChunk()) event.preventDefault();
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isStaleChunkError(event.reason)) reloadForStaleChunk();
  });
}
