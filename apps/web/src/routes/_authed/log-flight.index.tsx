import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { LogFlightForm } from '#/components/log-flight-form'
import { aircraftQueryOptions } from '#/lib/queries/aircraft'
import { flightsSummaryQueryOptions } from '#/lib/queries/flights'
import { pilotProfileQueryOptions } from '#/lib/queries/pilot'

export const Route = createFileRoute('/_authed/log-flight/')({
  loader: async ({ context: { queryClient, pilotId } }) => {
    await Promise.all([
      queryClient.ensureQueryData(aircraftQueryOptions(pilotId)),
      queryClient.ensureQueryData(flightsSummaryQueryOptions(pilotId)),
      queryClient.ensureQueryData(pilotProfileQueryOptions()),
    ])
  },
  component: LogFlightPage,
})

function LogFlightPage() {
  const { pilotId } = Route.useRouteContext()
  const { data: aircraftList } = useSuspenseQuery(aircraftQueryOptions(pilotId))
  const { data: flightsData } = useSuspenseQuery(flightsSummaryQueryOptions(pilotId))
  const { data: profile } = useSuspenseQuery(pilotProfileQueryOptions())

  return (
    <LogFlightForm
      mode="create"
      pilotId={pilotId}
      aircraftList={aircraftList}
      flightsData={flightsData}
      profileType={profile.profileType}
    />
  )
}
