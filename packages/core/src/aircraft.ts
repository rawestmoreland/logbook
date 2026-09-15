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
 * `category_class` values 14 CFR 61.31(e) exempts from the retractable
 * landing gear requirement for "complex" — flaps and a controllable pitch
 * propeller still apply. Mirrors seaplaneCategoryClasses in
 * pocketbase/base/hooks/aircraft_models.go, which enforces this same rule
 * server-side.
 */
const SEAPLANE_CATEGORY_CLASSES = new Set<CategoryClass>([
  'airplane_single_engine_sea',
  'airplane_multi_engine_sea',
]);

/**
 * Whether an `aircraft_models` row with this equipment qualifies as
 * "complex" under 14 CFR 61.31(e): flaps and a controllable pitch propeller
 * always, plus retractable landing gear except for seaplanes. `complex`
 * isn't independently settable — it's always this derivation — so any UI
 * that lets a pilot describe a model's actual equipment can compute it
 * directly instead of asking for (and risking a mismatch with) a separate
 * complex checkbox.
 */
export function isComplexAircraft(params: {
  categoryClass: CategoryClass;
  flaps: boolean;
  controllablePitchProp: boolean;
  retractableGear: boolean;
}): boolean {
  if (!params.flaps || !params.controllablePitchProp) return false;
  if (SEAPLANE_CATEGORY_CLASSES.has(params.categoryClass)) return true;
  return params.retractableGear;
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
 * Minimum avionics fit an `aircraft_models` catalog entry is guaranteed to
 * have, mirroring MyFlightbook's avionics classification. This describes a
 * baseline for the model row, not necessarily what a specific tail has
 * installed — the same physical model can appear as more than one catalog
 * row if its avionics fit varies enough to matter (e.g. steam-gauge vs.
 * glass-panel trainers of the same type).
 */
export const MINIMUM_AVIONICS = ['non_glass', 'glass_pfd', 'glass_panel_taa'] as const;

export type MinimumAvionics = (typeof MINIMUM_AVIONICS)[number];

export const MINIMUM_AVIONICS_LABELS: Record<MinimumAvionics, string> = {
  non_glass: 'Available in non-glass configurations',
  glass_pfd: 'Glass PFD',
  glass_panel_taa: 'Glass PFD, MFD, and integrated Autopilot (TAA)',
};

export function isMinimumAvionics(value: string): value is MinimumAvionics {
  return (MINIMUM_AVIONICS as readonly string[]).includes(value);
}

/**
 * Engine type for an `aircraft_models` catalog entry — separate from
 * category/class since, e.g., airplane_single_engine_land spans both piston
 * trainers and turboprop singles.
 */
export const ENGINE_TYPES = ['piston', 'turboprop', 'jet', 'turbine_other', 'electric'] as const;

export type EngineType = (typeof ENGINE_TYPES)[number];

export const ENGINE_TYPE_LABELS: Record<EngineType, string> = {
  piston: 'Piston',
  turboprop: 'Turboprop',
  jet: 'Jet',
  turbine_other: 'Turbine (Other)',
  electric: 'Electric',
};

export function isEngineType(value: string): value is EngineType {
  return (ENGINE_TYPES as readonly string[]).includes(value);
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
