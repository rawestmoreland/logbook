import { createServerFn } from '@tanstack/react-start'
import { ClientResponseError } from 'pocketbase'

import { categoryOf, ENDORSEMENT_CERTIFICATION_TEXT, parseDateValue, resolveAircraftType, toCfiLookupResult } from '@logbook/core'

import type {
  AircraftModelsResponse,
  AircraftResponse,
  Category,
  CfiLookupResult,
  EndorsementsResponse,
  EndorsementType,
  FlightsResponse,
  PilotsResponse,
  UsersResponse,
} from '@logbook/core'

import { toAircraftTypeInfo } from '#/lib/server/models'
import { buildFileUrl, createAdminPocketBase, createRequestPocketBase } from '#/lib/server/pocketbase'

// The pieces of a signature (issue #68) needed to render an endorsement's
// state — empty strings mean "not signed"/"no signature requested", same
// as how PocketBase itself represents an unset text/date field, rather than
// introducing a separate null-vs-unset distinction the UI doesn't need.
export type Endorsement = {
  id: string
  date: string
  type: EndorsementType
  text: string
  flightId: string
  pilotId: string
  instructorName: string
  instructorCertificateNumber: string
  signedAt: string
  contentHash: string
  signToken: string
  signTokenExpires: string
  // The linked `instructor` (a `pilots` id/name), set by
  // `assignEndorsementInstructor` and cleared once `instructorName` (the
  // CFI's typed attestation at signing) takes over — distinct from
  // `instructorName` because this reflects an assignment that hasn't been
  // signed yet, not the attestation itself.
  instructorPilotId: string
  instructorPilotName: string
  // Short-lived token-scoped URL for the drawn signature (issue #68
  // follow-up), empty when none was drawn — see `buildFileUrl`. Built fresh
  // by `getEndorsementForFlight` below, not by `toEndorsement`, since minting
  // the token is async and `createEndorsement`'s freshly-created record never
  // has one yet anyway.
  signatureUrl: string
}

// Back-compat aliases — same shape, kept so callers that name a specific
// endorsement type read naturally (e.g. `FlightReviewEndorsement` in a
// `useState<FlightReviewEndorsement | null>`) without every type-specific
// use site having to import the generic `Endorsement` name instead.
export type FlightReviewEndorsement = Endorsement
export type IpcEndorsement = Endorsement
export type CheckrideEndorsement = Endorsement

type EndorsementWithFlight = EndorsementsResponse<{
  flight?: FlightsResponse
  instructor?: PilotsResponse
}>

function toEndorsement(record: EndorsementWithFlight): Endorsement {
  return {
    id: record.id,
    date: record.date.slice(0, 10),
    type: record.type,
    text: record.text,
    flightId: record.flight,
    pilotId: record.expand.flight?.pilot ?? '',
    instructorName: record.instructor_name,
    instructorCertificateNumber: record.instructor_certificate_number,
    signedAt: record.signed_at ? record.signed_at.slice(0, 10) : '',
    contentHash: record.content_hash,
    signToken: record.sign_token,
    signTokenExpires: record.sign_token_expires,
    signatureUrl: '',
    instructorPilotId: record.instructor,
    instructorPilotName: record.expand.instructor?.name ?? '',
  }
}

/**
 * Whether the given flight already carries an endorsement of `type` — used
 * by the edit-flight form to show "already logged" instead of letting a
 * pilot log the same endorsement twice. One parameterized function instead
 * of a `getXForFlight` per type: the query is identical across all six
 * `EndorsementType`s bar the literal they filter on, so a per-type wrapper
 * would just be this same body copy-pasted six times. The tradeoff is call
 * sites now pass `type` explicitly instead of it being implied by the
 * function name.
 */
export const getEndorsementForFlight = createServerFn({ method: 'GET' })
  .validator((data: { flightId: string; type: EndorsementType }) => data)
  .handler(async ({ data }): Promise<Endorsement | null> => {
    const pb = createRequestPocketBase()
    try {
      const existing = await pb
        .collection('endorsements')
        .getFirstListItem<EndorsementWithFlight>(
          pb.filter('flight = {:flightId} && type = {:type} && deleted != true', {
            flightId: data.flightId,
            type: data.type,
          }),
          { expand: 'flight,instructor' },
        )
      const endorsement = toEndorsement(existing)
      if (existing.signature) {
        endorsement.signatureUrl = await buildFileUrl(pb, existing, existing.signature)
      }
      return endorsement
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 404) return null
      throw err
    }
  })

/**
 * Self-logs an endorsement of `type` against one of the pilot's own flights.
 * `instructor` (the relation-to-`pilots` field) and `signature` (the file
 * field) are left blank for every type — a signature, if the pilot wants
 * one, is a separate opt-in step taken after logging, either by sharing a
 * no-account `/sign/:token` link (`requestEndorsementSignature` in
 * `endorsement-signatures.ts`) or, if the CFI already has a linked pilot
 * account here, by assigning them as `instructor` (`assignEndorsementInstructor`
 * below) so they can sign in authenticated (`signEndorsementAsInstructor`).
 * PocketBase's own `createRule` (`flight.pilot.user = @request.auth.id`) is
 * the actual authority on ownership, same as `createFlight`.
 */
export const createEndorsement = createServerFn({ method: 'POST' })
  .validator((data: { flightId: string; type: EndorsementType; date: string }) => data)
  .handler(async ({ data }): Promise<Endorsement> => {
    const pb = createRequestPocketBase()
    const created = await pb.collection('endorsements').create<EndorsementWithFlight>(
      {
        flight: data.flightId,
        type: data.type,
        date: parseDateValue(data.date).toISOString(),
      },
      { expand: 'flight' },
    )
    return toEndorsement(created)
  })

/**
 * Most recent endorsement of `type` for any of the pilot's flights,
 * pilot-wide — the two-hop relation filter `flight.pilot = ...` mirrors the
 * pattern `flights`' own rules already use for `pilot.user =
 * @request.auth.id`, chained one hop further. Correct for `flight_review`,
 * `checkride`, `complex`, `high_performance`, and `tailwheel` — all
 * pilot-wide, not scoped to a category the way `ipc` is. Feeds
 * `flightReviewCurrency()`'s `lastReview`/`lastCheckride`. NOT correct for
 * `ipc`; see `getLatestIpcDate` below for why that one stays separate.
 */
export const getLatestEndorsementDate = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string; type: EndorsementType }) => data)
  .handler(async ({ data }): Promise<string | null> => {
    const pb = createRequestPocketBase()
    try {
      const latest = await pb.collection('endorsements').getFirstListItem(
        pb.filter('flight.pilot = {:pilotId} && type = {:type} && deleted != true', {
          pilotId: data.pilotId,
          type: data.type,
        }),
        { sort: '-date' },
      )
      return latest.date.slice(0, 10)
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 404) return null
      throw err
    }
  })

/**
 * Earliest endorsement of `type` for any of the pilot's flights, pilot-wide.
 * Only meaningful for endorsement types that, once earned, satisfy 14 CFR
 * 61.31 forever — `complex`, `high_performance`, `tailwheel` — where the
 * relevant question for a given flight is "had the pilot been endorsed by
 * this date yet", not "when was the most recent one" (unlike a flight review
 * or IPC, these never expire and never need renewing, so only the *first*
 * one matters). Same relation filter as `getLatestEndorsementDate`, sorted
 * ascending instead of descending.
 */
export const getEarliestEndorsementDate = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string; type: EndorsementType }) => data)
  .handler(async ({ data }): Promise<string | null> => {
    const pb = createRequestPocketBase()
    try {
      const earliest = await pb.collection('endorsements').getFirstListItem(
        pb.filter('flight.pilot = {:pilotId} && type = {:type} && deleted != true', {
          pilotId: data.pilotId,
          type: data.type,
        }),
        { sort: 'date' },
      )
      return earliest.date.slice(0, 10)
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 404) return null
      throw err
    }
  })

/**
 * Most recent `ipc` endorsement for the pilot, scoped to one FAA *category*
 * (airplane, rotorcraft, ...) — not the whole pilot like flight review.
 *
 * A flight review is a pilot-wide privilege, but an IPC (like the
 * approaches/holding/tracking it substitutes for in `instrumentCurrency`) is
 * flown in a specific aircraft, and 61.57(c)/(d) currency itself is scoped
 * per category, not per pilot. There's no PocketBase field to filter on
 * directly — `category` is a derived grouping of `aircraft_models.category_class`
 * (see `categoryOf` in `@logbook/core`) — so this fetches the pilot's `ipc`
 * endorsements newest-first with the flight's aircraft/model expanded, same
 * shape as `getCurrencyData`'s flight fetch, and returns the first one whose
 * resolved category matches.
 */
export const getLatestIpcDate = createServerFn({ method: 'GET' })
  .validator((data: { pilotId: string; category: Category }) => data)
  .handler(async ({ data }): Promise<string | null> => {
    const pb = createRequestPocketBase()
    const endorsements = await pb.collection('endorsements').getFullList<EndorsementsResponse>({
      filter: pb.filter('flight.pilot = {:pilotId} && type = "ipc" && deleted != true', {
        pilotId: data.pilotId,
      }),
      sort: '-date',
      expand: 'flight.aircraft.model',
    })

    for (const endorsement of endorsements) {
      const flight = (
        endorsement.expand as
          | { flight?: FlightsResponse<{ aircraft?: AircraftResponse<{ model?: AircraftModelsResponse }> }> }
          | undefined
      )?.flight
      const model = flight?.expand.aircraft?.expand.model
      // Prefers the flight's frozen `logged_*` snapshot over the live
      // aircraft.model expand (issue #71) — see resolveAircraftType.
      const live = model ? toAircraftTypeInfo(model) : null
      const resolved = resolveAircraftType(flight, live)
      if (!resolved) continue
      if (categoryOf(resolved.categoryClass) !== data.category) continue
      return endorsement.date.slice(0, 10)
    }
    return null
  })

export type { CfiLookupResult }

/**
 * Looks up a CFI-flagged pilot by their account email, for the "Assign to my
 * linked CFI" flow (`assignEndorsementInstructor` below). `pilots`' own
 * `listRule`/`viewRule` only ever let a pilot see their own record
 * (`user = @request.auth.id`), so a lookup across pilots necessarily bypasses
 * it — same rationale as `createAdminPocketBase`'s doc comment gives for the
 * token sign flow: keep the authorization/redaction logic in one reviewable
 * place in code. Never returns anything beyond `{id, name}` (no email, no
 * user id) — same "no logbook data beyond what's declared" precedent as
 * `EndorsementSigningInfo` in `endorsement-signatures.ts`. Returns `null`
 * (not an error) for no match, a non-instructor pilot, or the caller looking
 * up themselves.
 */
export const findCfiByEmail = createServerFn({ method: 'GET' })
  .validator((data: { email: string }) => data)
  .handler(async ({ data }): Promise<CfiLookupResult> => {
    const email = data.email.trim().toLowerCase()
    if (!email) return null

    const requestPb = createRequestPocketBase()
    const callerUserId = requestPb.authStore.record?.id
    if (!callerUserId) return null

    const pb = await createAdminPocketBase()
    try {
      // Filtering on `is_instructor = true` here is belt-and-suspenders —
      // `toCfiLookupResult` re-checks it below, since that's the reviewable,
      // unit-tested place this decision actually lives (see its doc comment
      // in @logbook/core).
      const pilot = await pb
        .collection('pilots')
        .getFirstListItem<PilotsResponse<unknown, { user?: UsersResponse }>>(
          pb.filter('is_instructor = true && user.email = {:email}', { email }),
          { expand: 'user' },
        )
      return toCfiLookupResult(
        { id: pilot.id, name: pilot.name, isInstructor: pilot.is_instructor, userId: pilot.user },
        callerUserId,
      )
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 404) return null
      throw err
    }
  })

/**
 * Links an existing pilot account as the `instructor` on one of the caller's
 * own endorsements — the account-linked alternative to
 * `requestEndorsementSignature`'s no-account sign link. Authenticated, and
 * relies on the endorsements collection's existing `updateRule`
 * (`flight.pilot.user = @request.auth.id`) as the actual authority, same as
 * `requestEndorsementSignature`; no rule change was needed for this, since
 * `instructor` was already a writable relation field. Only assignable before
 * `signed_at` is set — mirrors `requestEndorsementSignature`'s
 * already-signed guard, since re-assigning the instructor on a signed
 * endorsement would let a pilot swap out who's on record as having signed
 * it.
 *
 * `instructor` is a bare relation field with no field-level constraint tying
 * it to `is_instructor` pilots, so `instructorPilotId` is re-validated here
 * with the same `toCfiLookupResult` check `findCfiByEmail` uses — the client
 * normally only ever gets an id from that lookup, but a client can't be
 * trusted not to send an arbitrary pilot id, which would otherwise grant
 * that pilot view access to this endorsement through the existing
 * `listRule`/`viewRule` (`instructor.user = @request.auth.id`).
 */
export const assignEndorsementInstructor = createServerFn({ method: 'POST' })
  .validator((data: { endorsementId: string; instructorPilotId: string }) => data)
  .handler(async ({ data }): Promise<Endorsement> => {
    const pb = createRequestPocketBase()
    const endorsement = await pb.collection('endorsements').getOne<EndorsementsResponse>(data.endorsementId)

    if (endorsement.signed_at) {
      throw new Error('This endorsement has already been signed.')
    }

    const adminPb = await createAdminPocketBase()
    let instructorCandidate: PilotsResponse
    try {
      instructorCandidate = await adminPb.collection('pilots').getOne<PilotsResponse>(data.instructorPilotId)
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 404) {
        throw new Error('That CFI could not be found.')
      }
      throw err
    }
    const validatedInstructor = toCfiLookupResult(
      {
        id: instructorCandidate.id,
        name: instructorCandidate.name,
        isInstructor: instructorCandidate.is_instructor,
        userId: instructorCandidate.user,
      },
      pb.authStore.record?.id ?? '',
    )
    if (!validatedInstructor) {
      throw new Error('That CFI could not be found.')
    }

    const updated = await pb.collection('endorsements').update<EndorsementWithFlight>(
      data.endorsementId,
      {
        instructor: data.instructorPilotId,
        // Same "fill in the certifying language on first hand-off to a CFI"
        // behavior as `requestEndorsementSignature`, so a CFI signing via
        // either path sees what they're attesting to.
        ...(endorsement.text ? {} : { text: ENDORSEMENT_CERTIFICATION_TEXT[endorsement.type] }),
      },
      { expand: 'flight,instructor' },
    )
    return toEndorsement(updated)
  })
