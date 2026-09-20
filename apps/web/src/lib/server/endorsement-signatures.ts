import { createServerFn } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'
import { ClientResponseError } from 'pocketbase'

import { computeEndorsementContentHash, ENDORSEMENT_CERTIFICATION_TEXT } from '@logbook/core'

import type { EndorsementsResponse, EndorsementType, FlightsResponse, PilotsResponse } from '@logbook/core'

import { createAdminPocketBase, createRequestPocketBase } from '#/lib/server/pocketbase'

// A CFI's sign link is only as good as this token — it's the sole
// credential `getEndorsementForSigning`/`signEndorsement` check (see
// `createAdminPocketBase`'s doc comment for why those two bypass PocketBase
// rules entirely). Two concatenated UUIDv4s is 256 bits of randomness,
// comfortably "opaque, high-entropy" for a single-use link a pilot shares
// by text/email/AirDrop.
function generateSignToken(): string {
  return crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
}

const SIGN_TOKEN_TTL_DAYS = 7

/**
 * Requests a signature on an already-logged endorsement: generates the
 * single-use token + expiry and returns the shareable `/sign/:token` link
 * for the pilot to send their CFI however they like (issue #68 — no email
 * delivery infrastructure, no CFI accounts). Authenticated, and relies on
 * the endorsements collection's existing `updateRule`
 * (`flight.pilot.user = @request.auth.id`) as the actual authority — same
 * pattern as every other endorsement server function, unlike the two below.
 */
export const requestEndorsementSignature = createServerFn({ method: 'POST' })
  .validator((data: { endorsementId: string }) => data)
  .handler(async ({ data }): Promise<{ signUrl: string; expiresAt: string }> => {
    const pb = createRequestPocketBase()
    const endorsement = await pb.collection('endorsements').getOne<EndorsementsResponse>(data.endorsementId)

    if (endorsement.signed_at) {
      throw new Error('This endorsement has already been signed.')
    }

    const signToken = generateSignToken()
    const expiresAt = new Date(Date.now() + SIGN_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)

    await pb.collection('endorsements').update(data.endorsementId, {
      sign_token: signToken,
      sign_token_expires: expiresAt.toISOString(),
      // Fill in the certifying language only if it's still blank — a pilot
      // who has customized `text` (e.g. via the admin UI) shouldn't have it
      // silently overwritten by a later re-request.
      ...(endorsement.text ? {} : { text: ENDORSEMENT_CERTIFICATION_TEXT[endorsement.type] }),
    })

    return { signUrl: `${getRequestUrl().origin}/sign/${signToken}`, expiresAt: expiresAt.toISOString() }
  })

type EndorsementForSigning = EndorsementsResponse<{
  flight?: FlightsResponse<{ pilot?: PilotsResponse }>
}>

async function findBySignToken(
  pb: Awaited<ReturnType<typeof createAdminPocketBase>>,
  token: string,
): Promise<EndorsementForSigning | null> {
  try {
    return await pb
      .collection('endorsements')
      .getFirstListItem<EndorsementForSigning>(pb.filter('sign_token = {:token}', { token }), {
        expand: 'flight.pilot',
      })
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null
    throw err
  }
}

function isExpired(record: EndorsementForSigning): boolean {
  return !record.sign_token_expires || new Date(record.sign_token_expires) < new Date()
}

export type EndorsementSigningInfo = {
  type: EndorsementType
  date: string
  text: string
  pilotName: string
}

export type EndorsementSigningStatus =
  | { state: 'pending'; info: EndorsementSigningInfo }
  | {
      state: 'signed'
      info: EndorsementSigningInfo
      instructorName: string
      instructorCertificateNumber: string
      signedAt: string
    }
  | { state: 'expired' }
  | { state: 'not_found' }

/**
 * What a CFI sees when they open a sign link — no login, so this and
 * `signEndorsement` below use `createAdminPocketBase()` rather than
 * PocketBase collection rules to authorize access; the token itself (not an
 * `@request.auth`-based rule) is what scopes them to this one record. Never
 * returns anything beyond what's declared on `EndorsementSigningInfo` —
 * no flight id, no pilot id, nothing that would help a guess-the-token
 * attempt or reveal other data about the pilot's logbook.
 */
export const getEndorsementForSigning = createServerFn({ method: 'GET' })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<EndorsementSigningStatus> => {
    if (!data.token) return { state: 'not_found' }

    const pb = await createAdminPocketBase()
    const record = await findBySignToken(pb, data.token)
    if (!record) return { state: 'not_found' }

    const info: EndorsementSigningInfo = {
      type: record.type,
      date: record.date.slice(0, 10),
      text: record.text,
      pilotName: record.expand.flight?.expand.pilot?.name ?? '',
    }

    if (record.signed_at) {
      return {
        state: 'signed',
        info,
        instructorName: record.instructor_name,
        instructorCertificateNumber: record.instructor_certificate_number,
        signedAt: record.signed_at.slice(0, 10),
      }
    }

    if (isExpired(record)) return { state: 'expired' }

    return { state: 'pending', info }
  })

export type SignEndorsementResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'expired' | 'already_signed' | 'invalid_input' }

/**
 * Signs an endorsement by token: validates the token (exists, not expired,
 * not already signed — re-signing an already-signed token is rejected, so a
 * link can't be used twice), then stores the instructor's typed attestation
 * plus a content hash over the fields that must not change post-signing
 * (see `computeEndorsementContentHash` in `@logbook/core`). Unauthenticated,
 * same admin-bypass rationale as `getEndorsementForSigning` above.
 */
export const signEndorsement = createServerFn({ method: 'POST' })
  .validator((data: { token: string; instructorName: string; certificateNumber: string }) => data)
  .handler(async ({ data }): Promise<SignEndorsementResult> => {
    const instructorName = data.instructorName.trim()
    const certificateNumber = data.certificateNumber.trim()
    if (!data.token || !instructorName || !certificateNumber) {
      return { ok: false, reason: 'invalid_input' }
    }

    const pb = await createAdminPocketBase()
    const record = await findBySignToken(pb, data.token)
    if (!record) return { ok: false, reason: 'not_found' }
    if (record.signed_at) return { ok: false, reason: 'already_signed' }
    if (isExpired(record)) return { ok: false, reason: 'expired' }

    const contentHash = computeEndorsementContentHash({
      type: record.type,
      date: record.date.slice(0, 10),
      text: record.text,
      flightId: record.flight,
      pilotId: record.expand.flight?.pilot ?? '',
    })

    await pb.collection('endorsements').update(record.id, {
      instructor_name: instructorName,
      instructor_certificate_number: certificateNumber,
      signed_at: new Date().toISOString(),
      content_hash: contentHash,
    })

    return { ok: true }
  })
