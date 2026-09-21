import { createServerFn } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'
import { ClientResponseError } from 'pocketbase'

import { computeEndorsementContentHash, ENDORSEMENT_CERTIFICATION_TEXT } from '@logbook/core'

import type { EndorsementsResponse, EndorsementType, FlightsResponse, PilotsResponse } from '@logbook/core'

import { buildFileUrl, createAdminPocketBase, createRequestPocketBase } from '#/lib/server/pocketbase'

// The one format the sign form exports (`canvas.toDataURL('image/png')`) —
// matches the `mimeTypes: ["image/png"]` restriction on the `signature`
// field's PocketBase migration, so a mismatched data URL is rejected here
// with the same "invalid_signature_image" reason before ever reaching
// PocketBase's own (less friendly) validation error.
const SIGNATURE_DATA_URL_RE = /^data:image\/png;base64,([a-zA-Z0-9+/]+=*)$/

/**
 * Decodes a `canvas.toDataURL('image/png')` data URL into a `File` PocketBase's
 * JS SDK will multipart-upload. Throws on anything that isn't a well-formed
 * PNG data URL; callers turn that into `SignEndorsementResult`'s
 * `invalid_signature_image` reason rather than letting a raw parse error
 * reach the client.
 */
function decodeSignatureImage(dataUrl: string, filename: string): File {
  const match = SIGNATURE_DATA_URL_RE.exec(dataUrl)
  if (!match) throw new Error('Not a PNG data URL')

  const binary = atob(match[1])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  return new File([bytes], filename, { type: 'image/png' })
}

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
      // Empty string when the CFI didn't draw a signature (it's optional —
      // see `signEndorsement`'s handler doc comment).
      signatureUrl: string
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
        signatureUrl: record.signature ? await buildFileUrl(pb, record, record.signature) : '',
      }
    }

    if (isExpired(record)) return { state: 'expired' }

    return { state: 'pending', info }
  })

export type SignEndorsementResult =
  | { ok: true }
  | {
      ok: false
      reason: 'not_found' | 'expired' | 'already_signed' | 'invalid_input' | 'invalid_signature_image'
    }

/**
 * Signs an endorsement by token: validates the token (exists, not expired,
 * not already signed — re-signing an already-signed token is rejected, so a
 * link can't be used twice), then stores the instructor's typed attestation
 * plus a content hash over the fields that must not change post-signing
 * (see `computeEndorsementContentHash` in `@logbook/core`). Unauthenticated,
 * same admin-bypass rationale as `getEndorsementForSigning` above.
 *
 * `signatureImage` (a `canvas.toDataURL('image/png')` data URL) is optional
 * — the typed name/certificate pair above is already this app's legal
 * signature of record (see the compliance analysis behind issue #68); a
 * drawn image is additive polish the CFI can skip, so signing with an empty
 * canvas still succeeds. When present, it's decoded into a `File` and
 * uploaded to the `signature` field alongside the rest of the update; a
 * rejection from PocketBase's own field validation (over the
 * `mimeTypes`/`maxSize` cap set in the `signature` field's migration) is
 * caught and reported as `invalid_signature_image` rather than leaking a raw
 * `ClientResponseError` to the client.
 */
export const signEndorsement = createServerFn({ method: 'POST' })
  .validator(
    (data: { token: string; instructorName: string; certificateNumber: string; signatureImage?: string }) => data,
  )
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

    let signatureFile: File | undefined
    if (data.signatureImage) {
      try {
        signatureFile = decodeSignatureImage(data.signatureImage, `${record.id}-signature.png`)
      } catch {
        return { ok: false, reason: 'invalid_signature_image' }
      }
    }

    const contentHash = computeEndorsementContentHash({
      type: record.type,
      date: record.date.slice(0, 10),
      text: record.text,
      flightId: record.flight,
      pilotId: record.expand.flight?.pilot ?? '',
    })

    try {
      await pb.collection('endorsements').update(record.id, {
        instructor_name: instructorName,
        instructor_certificate_number: certificateNumber,
        signed_at: new Date().toISOString(),
        content_hash: contentHash,
        ...(signatureFile ? { signature: signatureFile } : {}),
      })
    } catch (err) {
      if (signatureFile && err instanceof ClientResponseError) {
        return { ok: false, reason: 'invalid_signature_image' }
      }
      throw err
    }

    return { ok: true }
  })
