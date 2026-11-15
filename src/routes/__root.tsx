import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  ClientOnly,
} from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppNav } from "@/components/AppNav";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/lib/i18n";
import { PracticeProvider } from "@/lib/practice-context";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="text-center">
        <p className="label-eyebrow">404</p>
        <h1 className="mt-3 font-serif text-5xl">Not here.</h1>
        <p className="mt-3 text-sm text-ink-muted">
          Try returning home and picking up your practice again.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex rounded-md bg-ink px-4 py-2 text-sm text-background"
        >
          Home
        </a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-3xl">Something went sideways.</h1>
        <p className="mt-3 text-sm text-ink-muted">{(error as Error).message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-md bg-ink px-4 py-2 text-sm text-background"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "VONA — Personal Yoga Sequence Studio" },
      {
        name: "description",
        content:
          "A personal studio for building, saving, and printing yoga sequences from your own pose library.",
      },
      { property: "og:title", content: "VONA — Personal Yoga Sequence Studio" },
      {
        property: "og:description",
        content: "Build, save, and print yoga sequences from your own pose library.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <PracticeProvider>
        <div className="min-h-screen bg-background text-foreground">
          <AppNav />
          <ClientOnly fallback={null}><Outlet /></ClientOnly>
          <Toaster />
        </div>
        </PracticeProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
