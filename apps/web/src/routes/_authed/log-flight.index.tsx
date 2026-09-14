import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { LogFlightForm } from '#/components/log-flight-form'
import { aircraftQueryOptions } from '#/lib/queries/aircraft'
import { flightsQueryOptions } from '#/lib/queries/flights'

export const Route = createFileRoute('/_authed/log-flight/')({
  loader: async ({ context: { queryClient, pilotId } }) => {
    await Promise.all([
      queryClient.ensureQueryData(aircraftQueryOptions(pilotId)),
      queryClient.ensureQueryData(flightsQueryOptions(pilotId)),
    ])
  },
  component: LogFlightPage,
})

function LogFlightPage() {
  const { pilotId } = Route.useRouteContext()
  const { data: aircraftList } = useSuspenseQuery(aircraftQueryOptions(pilotId))
  const { data: flightsData } = useSuspenseQuery(flightsQueryOptions(pilotId))

  return (
    <LogFlightForm
      mode="create"
      pilotId={pilotId}
      aircraftList={aircraftList}
      flightsData={flightsData}
    />
  )
}
