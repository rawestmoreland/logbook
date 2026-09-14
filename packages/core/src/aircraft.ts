/**
 * FAA category/class ratings (14 CFR 61.5(b)) that an aircraft's
 * `category_class` field is constrained to. Kept as a closed set rather than
 * free text since currency and logging rules key off these exact values.
 */
export const CATEGORY_CLASSES = [
  'airplane_single_engine_land',
  'airplane_multi_engine_land',
  'airplane_single_engine_sea',
  'airplane_multi_engine_sea',
  'rotorcraft_helicopter',
  'rotorcraft_gyroplane',
  'glider',
  'lighter_than_air_airship',
  'lighter_than_air_balloon',
  'powered_lift',
  'powered_parachute_land',
  'powered_parachute_sea',
  'weight_shift_control_land',
  'weight_shift_control_sea',
] as const;

export type CategoryClass = (typeof CATEGORY_CLASSES)[number];

export const CATEGORY_CLASS_LABELS: Record<CategoryClass, string> = {
  airplane_single_engine_land: 'Airplane Single-Engine Land',
  airplane_multi_engine_land: 'Airplane Multi-Engine Land',
  airplane_single_engine_sea: 'Airplane Single-Engine Sea',
  airplane_multi_engine_sea: 'Airplane Multi-Engine Sea',
  rotorcraft_helicopter: 'Rotorcraft - Helicopter',
  rotorcraft_gyroplane: 'Rotorcraft - Gyroplane',
  glider: 'Glider',
  lighter_than_air_airship: 'Lighter-Than-Air - Airship',
  lighter_than_air_balloon: 'Lighter-Than-Air - Balloon',
  powered_lift: 'Powered Lift',
  powered_parachute_land: 'Powered Parachute Land',
  powered_parachute_sea: 'Powered Parachute Sea',
  weight_shift_control_land: 'Weight-Shift-Control Land',
  weight_shift_control_sea: 'Weight-Shift-Control Sea',
};

export function isCategoryClass(value: string): value is CategoryClass {
  return (CATEGORY_CLASSES as readonly string[]).includes(value);
}

/**
 * FAA *category* (61.5(b)) — the coarser grouping the instrument currency rule
 * keys off. 61.57(c) is per-category, while 61.57(a)/(b) are per category AND
 * class, so the two rules need different comparisons.
 */
export const CATEGORIES = [
  'airplane',
  'rotorcraft',
  'glider',
  'lighter_than_air',
  'powered_lift',
  'powered_parachute',
  'weight_shift_control',
] as const;

export type Category = (typeof CATEGORIES)[number];

const CATEGORY_OF: Record<CategoryClass, Category> = {
  airplane_single_engine_land: 'airplane',
  airplane_multi_engine_land: 'airplane',
  airplane_single_engine_sea: 'airplane',
  airplane_multi_engine_sea: 'airplane',
  rotorcraft_helicopter: 'rotorcraft',
  rotorcraft_gyroplane: 'rotorcraft',
  glider: 'glider',
  lighter_than_air_airship: 'lighter_than_air',
  lighter_than_air_balloon: 'lighter_than_air',
  powered_lift: 'powered_lift',
  powered_parachute_land: 'powered_parachute',
  powered_parachute_sea: 'powered_parachute',
  weight_shift_control_land: 'weight_shift_control',
  weight_shift_control_sea: 'weight_shift_control',
};

export function categoryOf(categoryClass: CategoryClass): Category {
  return CATEGORY_OF[categoryClass];
}

/**
 * What kind of device an `aircraft` row represents — mirrors MyFlightbook's
 * `AircraftInstanceTypes` enum. A single field on the aircraft record rather
 * than a separate "is this a sim" boolean, so a training device is just
 * another `aircraft_models` row (e.g. a Redbird AATD made by "Redbird") with
 * `instance_type` set accordingly.
 */
export const AIRCRAFT_INSTANCE_TYPES = [
  'real',
  'uncertified_sim',
  'certified_ifr_sim',
  'certified_ifr_landings_sim',
  'certified_atd',
] as const;

export type AircraftInstanceType = (typeof AIRCRAFT_INSTANCE_TYPES)[number];

export const AIRCRAFT_INSTANCE_TYPE_LABELS: Record<AircraftInstanceType, string> = {
  real: 'Real aircraft',
  uncertified_sim: 'Uncertified simulator',
  certified_ifr_sim: 'Certified IFR simulator',
  certified_ifr_landings_sim: 'Certified IFR & landings simulator',
  certified_atd: 'Certified ATD',
};

export function isAircraftInstanceType(value: string): value is AircraftInstanceType {
  return (AIRCRAFT_INSTANCE_TYPES as readonly string[]).includes(value);
}

/**
 * An "anonymous" (no logged tail number) aircraft is still `instance_type:
 * 'real'`, but its `tail_number` is synthesized server-side as `#` followed
 * by the model's id — mirroring MyFlightbook's `AnonymousTailnumberForModel`.
 * Every pilot who logs an anonymous aircraft of the same model shares the
 * same synthesized tail, and therefore the same underlying `aircraft` row.
 */
export function anonymousTailNumberForModel(modelId: string): string {
  return `#${modelId}`;
}

export function isAnonymousTail(tailNumber: string): boolean {
  return tailNumber.startsWith('#');
}

/**
 * Display-friendly tail number: an anonymous tail (see `isAnonymousTail`)
 * renders as "Anonymous <model description>" rather than the raw `#<id>`
 * synthesized value.
 */
export function displayTailNumber(tailNumber: string, modelDescription: string): string {
  return isAnonymousTail(tailNumber) ? `Anonymous ${modelDescription}` : tailNumber;
}
