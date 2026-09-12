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
