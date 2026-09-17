import { lazy, Suspense } from 'react'

import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'

import appCss from '../styles.css?url'

import { RootErrorComponent } from '#/components/root-error'
import { RootNotFoundComponent } from '#/components/root-not-found'
import { AuthProvider } from '#/contexts/auth-context'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'OpenFlyLog',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  notFoundComponent: RootNotFoundComponent,
  errorComponent: RootErrorComponent,
  shellComponent: RootDocument,
})

// Dead-code-eliminated in production builds: `import.meta.env.DEV` is
// statically replaced with `false`, so the dynamic import (and everything
// it pulls in) never makes it into the prod bundle.
const LazyDevtools = import.meta.env.DEV
  ? lazy(() => import('#/components/devtools'))
  : null

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
        {LazyDevtools && (
          <Suspense fallback={null}>
            <LazyDevtools />
          </Suspense>
        )}
        <Scripts />
      </body>
    </html>
  )
}
