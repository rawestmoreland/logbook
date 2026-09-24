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
 * Reasons a pilot can flag a shared `aircraft_models`/`manufacturers`
 * catalog row as wrong (`aircraft_model_reports.reason`) — mirrors
 * MyFlightbook's "report a problem with this aircraft" flow. Both
 * collections have no `updateRule` for regular pilots, so this queue is the
 * only way a pilot can act on a typo'd or misclassified entry; a superuser
 * triages it from the admin UI.
 */
export const AIRCRAFT_MODEL_REPORT_REASONS = [
  'wrong_manufacturer',
  'wrong_model_or_common_name',
  'wrong_category_class',
  'wrong_equipment_or_avionics',
  'duplicate_of_another_model',
  'other',
] as const;

export type AircraftModelReportReason = (typeof AIRCRAFT_MODEL_REPORT_REASONS)[number];

export const AIRCRAFT_MODEL_REPORT_REASON_LABELS: Record<AircraftModelReportReason, string> = {
  wrong_manufacturer: 'Wrong manufacturer',
  wrong_model_or_common_name: 'Wrong model or common name',
  wrong_category_class: 'Wrong category/class',
  wrong_equipment_or_avionics: 'Wrong equipment or avionics',
  duplicate_of_another_model: 'Duplicate of another model',
  other: 'Other',
};

export function isAircraftModelReportReason(value: string): value is AircraftModelReportReason {
  return (AIRCRAFT_MODEL_REPORT_REASONS as readonly string[]).includes(value);
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

/**
 * The currency/analysis/display-relevant slice of an `aircraft_models` row,
 * resolved either from a flight's frozen snapshot or from the live catalog
 * — see `resolveAircraftType`. `engineType` is `''` rather than omitted for
 * an engineless model (glider, training device), matching how the field
 * reads at runtime off an unset select (see `isEngineType`'s callers).
 */
export type AircraftTypeInfo = {
  description: string;
  categoryClass: CategoryClass;
  complex: boolean;
  highPerformance: boolean;
  tailwheel: boolean;
  engineType: EngineType | '';
};

/**
 * The subset of a `flights` row's `logged_*` fields (added for issue #71)
 * that `resolveAircraftType` needs — deliberately loose (plain `string` for
 * the two select fields, not their generated option-union types) so a raw
 * `FlightsRecord`/`FlightsResponse` from `pocketbase-types.ts` satisfies it
 * without a cast, the same way every other select field in this codebase is
 * widened to `string` before narrowing (see `isCategoryClass`'s callers).
 */
export type FlightAircraftSnapshot = {
  logged_aircraft_type?: string;
  logged_category_class?: string;
  logged_complex?: boolean;
  logged_high_performance?: boolean;
  logged_tailwheel?: boolean;
  logged_engine_type?: string;
};

/**
 * Picks a flight's frozen "aircraft as logged" snapshot over the live
 * `aircraft.model` catalog data, so a later correction to a shared
 * `aircraft_models` row (issue #71 — e.g. MyFlightBook reclassifying a
 * CRJ700 tail as a CRJ550) never silently changes how an already-logged
 * flight displays or counts toward part 61 currency. Every read site that
 * used to expand `aircraft.model` live (flights list, currency, analysis,
 * check-flights, endorsements) should resolve through this instead of
 * reading either source directly, so the fallback logic lives in one place.
 *
 * Falls back to `live` only when the flight predates the snapshot (an empty
 * `logged_category_class`, since `flights.ts`'s `createFlight`/`updateFlight`
 * always write a full snapshot going forward, and the issue #71 backfill
 * migration fills it in for every pre-existing row).
 */
export function resolveAircraftType(
  snapshot: FlightAircraftSnapshot | null | undefined,
  live: AircraftTypeInfo | null,
): AircraftTypeInfo | null {
  const categoryClass = snapshot?.logged_category_class;
  if (categoryClass && isCategoryClass(categoryClass)) {
    const engineType = snapshot?.logged_engine_type ?? '';
    return {
      description: snapshot?.logged_aircraft_type ?? '',
      categoryClass,
      complex: snapshot?.logged_complex ?? false,
      highPerformance: snapshot?.logged_high_performance ?? false,
      tailwheel: snapshot?.logged_tailwheel ?? false,
      engineType: isEngineType(engineType) ? engineType : '',
    };
  }
  return live;
}

const AIRCRAFT_TYPE_INFO_FIELDS = [
  'description',
  'categoryClass',
  'complex',
  'highPerformance',
  'tailwheel',
  'engineType',
] as const satisfies ReadonlyArray<keyof AircraftTypeInfo>;

/**
 * Which `AircraftTypeInfo` fields a flight's frozen "as logged" snapshot
 * disagrees with the aircraft's *current* live model data on (issue #71's
 * "they can change it in their records if they wish to match the new
 * data") — empty when they agree. Compares what the flight actually
 * resolves to via `resolveAircraftType`, so a flight with no snapshot yet
 * (which already reads live) never counts as drifted, and neither does
 * anything when `live` is `null` (an unresolvable model — there's no
 * current classification to sync to).
 */
export function aircraftTypeDriftFields(
  snapshot: FlightAircraftSnapshot | null | undefined,
  live: AircraftTypeInfo | null,
): Array<keyof AircraftTypeInfo> {
  if (!live) return [];
  const logged = resolveAircraftType(snapshot, live);
  if (!logged) return [];
  return AIRCRAFT_TYPE_INFO_FIELDS.filter((field) => logged[field] !== live[field]);
}

/**
 * Whether a flight's frozen snapshot has drifted from its aircraft's current
 * live model — see `aircraftTypeDriftFields`. Mirrored in Go by
 * hasAircraftTypeDrift in pocketbase/base/hooks/aircraft_notifications.go,
 * which uses the same rule server-side to decide who to email when an
 * aircraft is reclassified (issue #76). Keep the two in lockstep by hand.
 */
export function hasAircraftTypeDrift(
  snapshot: FlightAircraftSnapshot | null | undefined,
  live: AircraftTypeInfo | null,
): boolean {
  return aircraftTypeDriftFields(snapshot, live).length > 0;
}
