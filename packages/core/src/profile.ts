/**
 * Which data set personalizes the home screen — backed by `pilots.profile_type`.
 * Airline pilots want to see turbine PIC time and duty/rest; recreational
 * pilots want passenger and instrument currency instead. Empty/unset resolves
 * to `'recreational'`, the same fail-safe-default convention as an empty
 * `regulatory_profile` resolving to `'faa'` (see `isJurisdiction` in
 * `medical.ts`).
 */
export const PROFILE_TYPES = ['recreational', 'airline'] as const;

export type ProfileType = (typeof PROFILE_TYPES)[number];

export const PROFILE_TYPE_LABELS: Record<ProfileType, string> = {
  recreational: 'Recreational',
  airline: 'Airline',
};

export function isProfileType(value: string): value is ProfileType {
  return (PROFILE_TYPES as readonly string[]).includes(value);
}
