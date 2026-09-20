/**
 * `endorsements.type` values. Kept as a closed set rather than free text,
 * matching `aircraft.category_class`'s convention (see `aircraft.ts`).
 */
export const ENDORSEMENT_TYPES = [
  'flight_review',
  'ipc',
  'checkride',
  'complex',
  'high_performance',
  'tailwheel',
] as const;

export type EndorsementType = (typeof ENDORSEMENT_TYPES)[number];

export const ENDORSEMENT_TYPE_LABELS: Record<EndorsementType, string> = {
  flight_review: 'Flight Review',
  ipc: 'Instrument Proficiency Check',
  checkride: 'Checkride',
  complex: 'Complex Aircraft',
  high_performance: 'High-Performance Aircraft',
  tailwheel: 'Tailwheel Aircraft',
};

export function isEndorsementType(value: string): value is EndorsementType {
  return (ENDORSEMENT_TYPES as readonly string[]).includes(value);
}

/**
 * Default certifying language for each endorsement type — what a CFI is
 * actually attesting to by signing. Written into the endorsement's
 * (previously unused) `text` field the first time a pilot requests a
 * signature (see `requestEndorsementSignature` in
 * apps/web/src/lib/server/endorsement-signatures.ts), rather than left
 * blank the way self-attested endorsements leave it.
 */
export const ENDORSEMENT_CERTIFICATION_TEXT: Record<EndorsementType, string> = {
  flight_review:
    'I certify that the above-named pilot has satisfactorily completed a flight review as required by 14 CFR 61.56 on the date of this endorsement.',
  ipc: 'I certify that the above-named pilot has satisfactorily completed an instrument proficiency check as required by 14 CFR 61.57(d) on the date of this endorsement.',
  checkride:
    'I certify that the above-named pilot has satisfactorily completed a practical test (checkride) on the date of this endorsement.',
  complex:
    'I certify that the above-named pilot has received the training required by, and has been found proficient to act as pilot in command of a complex airplane under, 14 CFR 61.31(e) on the date of this endorsement.',
  high_performance:
    'I certify that the above-named pilot has received the training required by, and has been found proficient to act as pilot in command of a high-performance airplane under, 14 CFR 61.31(f) on the date of this endorsement.',
  tailwheel:
    'I certify that the above-named pilot has received the training required by, and has been found proficient to act as pilot in command of a tailwheel airplane under, 14 CFR 61.31(i) on the date of this endorsement.',
};

/**
 * The endorsement fields an electronic signature (issue #68) attests to —
 * everything that must not change post-signing. `flightId`/`pilotId` are
 * included so a signature can't be silently "moved" to a different flight
 * or pilot by editing the relation out from under it.
 */
export interface EndorsementContentFields {
  type: EndorsementType;
  date: string;
  text: string;
  flightId: string;
  pilotId: string;
}

/**
 * A deterministic, tamper-evident digest of `computeEndorsementContentHash`'s
 * input fields, run identically at signing time and again whenever a signed
 * endorsement is displayed — a mismatch means one of those fields changed
 * after the CFI signed. This intentionally isn't cryptographically strong
 * (no `SubtleCrypto`, which is async and would complicate the render-time
 * recheck in `log-flight-form.tsx`): "tamper-evident" here means "detectably
 * different," not "unforgeable," which a synchronous string digest is
 * sufficient for. Two independent 32-bit FNV-1a lanes (different seeds) are
 * concatenated to cut the effective collision rate versus a single 32-bit
 * hash.
 */
export function computeEndorsementContentHash(
  fields: EndorsementContentFields,
): string {
  const payload = JSON.stringify([
    fields.type,
    fields.date,
    fields.text,
    fields.flightId,
    fields.pilotId,
  ]);
  return fnv1a(payload, 0x811c9dc5) + fnv1a(payload, 0x9e3779b9);
}

function fnv1a(input: string, seed: number): string {
  let hash = seed;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
