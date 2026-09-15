import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { LogFlightForm } from '#/components/log-flight-form'
import { aircraftQueryOptions } from '#/lib/queries/aircraft'
import { flightQueryOptions, flightsSummaryQueryOptions } from '#/lib/queries/flights'

export const Route = createFileRoute('/_authed/log-flight/$flightId')({
  loader: async ({ context: { queryClient, pilotId }, params: { flightId } }) => {
    await Promise.all([
      queryClient.ensureQueryData(aircraftQueryOptions(pilotId)),
      queryClient.ensureQueryData(flightsSummaryQueryOptions(pilotId)),
      queryClient.ensureQueryData(flightQueryOptions(flightId)),
    ])
  },
  component: EditFlightPage,
})

function EditFlightPage() {
  const { pilotId } = Route.useRouteContext()
  const { flightId } = Route.useParams()
  const { data: aircraftList } = useSuspenseQuery(aircraftQueryOptions(pilotId))
  const { data: flightsData } = useSuspenseQuery(flightsSummaryQueryOptions(pilotId))
  const { data: flight } = useSuspenseQuery(flightQueryOptions(flightId))

  return (
    <LogFlightForm
      mode="edit"
      flightId={flightId}
      pilotId={pilotId}
      aircraftList={aircraftList}
      flightsData={flightsData}
      initialValues={flight}
    />
  )
}
