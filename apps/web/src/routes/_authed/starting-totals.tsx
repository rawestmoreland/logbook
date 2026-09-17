import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { StartingTotalsForm } from '#/components/starting-totals-form'
import { startingTotalsQueryOptions } from '#/lib/queries/flights'

export const Route = createFileRoute('/_authed/starting-totals')({
  loader: async ({ context: { queryClient, pilotId } }) => {
    await queryClient.ensureQueryData(startingTotalsQueryOptions(pilotId))
  },
  component: StartingTotalsPage,
})

function StartingTotalsPage() {
  const { pilotId } = Route.useRouteContext()
  const { data: initialValues } = useSuspenseQuery(startingTotalsQueryOptions(pilotId))

  return <StartingTotalsForm pilotId={pilotId} initialValues={initialValues} />
}
