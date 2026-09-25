/**
 * Airman certificate/rating types a pilot can record they hold (reference
 * data only — not wired into `currency`/`eligibility`). FAA-flavored; an
 * EASA pilot uses `other` + a `pilot_certificates.additional_ratings`
 * freeform note instead (see the certificates task's "Not in scope").
 */
export const CERTIFICATE_TYPES = [
  'student',
  'sport',
  'recreational',
  'private',
  'commercial',
  'atp',
  'cfi',
  'cfii',
  'mei',
  'ground_instructor',
  'remote_pilot',
  'other',
] as const;

export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export const CERTIFICATE_TYPE_LABELS: Record<CertificateType, string> = {
  student: 'Student',
  sport: 'Sport',
  recreational: 'Recreational',
  private: 'Private',
  commercial: 'Commercial',
  atp: 'ATP',
  cfi: 'CFI',
  cfii: 'CFII',
  mei: 'MEI',
  ground_instructor: 'Ground Instructor',
  remote_pilot: 'Remote Pilot (Part 107)',
  other: 'Other',
};

export function isCertificateType(value: string): value is CertificateType {
  return (CERTIFICATE_TYPES as readonly string[]).includes(value);
}
