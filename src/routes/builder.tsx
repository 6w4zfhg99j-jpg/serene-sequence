import { createFileRoute, redirect } from "@tanstack/react-router";

// "Create Sequence" now lives at "/" — keep the old path working.
export const Route = createFileRoute("/builder")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
