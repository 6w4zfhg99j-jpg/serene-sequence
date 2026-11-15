import { createStart } from "@tanstack/react-start";

// Desktop has no server-function calls and must never attach Cloud sessions.
// Hosted builds keep the protected middleware in start.ts unchanged.
export const startInstance = createStart(() => ({}));