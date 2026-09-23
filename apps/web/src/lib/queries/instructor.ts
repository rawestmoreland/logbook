import { queryOptions } from '@tanstack/react-query'

import { getInstructorEndorsements } from '#/lib/server/endorsement-signatures'

export function instructorEndorsementsQueryOptions() {
  return queryOptions({
    queryKey: ['instructor-endorsements'],
    queryFn: () => getInstructorEndorsements(),
  })
}
