/**
 * `endorsements.type` values. Kept as a closed set rather than free text,
 * matching `aircraft.category_class`'s convention (see `aircraft.ts`).
 */
export const ENDORSEMENT_TYPES = ['flight_review', 'ipc'] as const;

export type EndorsementType = (typeof ENDORSEMENT_TYPES)[number];

export const ENDORSEMENT_TYPE_LABELS: Record<EndorsementType, string> = {
  flight_review: 'Flight Review',
  ipc: 'Instrument Proficiency Check',
};

export function isEndorsementType(value: string): value is EndorsementType {
  return (ENDORSEMENT_TYPES as readonly string[]).includes(value);
}
