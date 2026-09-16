import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { getContext } from './integrations/tanstack-query/root-provider'
import { RootErrorComponent } from '#/components/root-error'

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // A route without its own `errorComponent` renders this during SSR for a
    // failed loader/beforeLoad (e.g. PocketBase unreachable) — SSR resolves
    // the error component for the specific failing match rather than
    // bubbling through React error boundaries, so the root route's
    // `errorComponent` alone doesn't cover it.
    defaultErrorComponent: RootErrorComponent,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
