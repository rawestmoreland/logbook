import type { CategoryClass, EngineType } from './aircraft.js';

/**
 * A known mapping from an opaque manufacturer type-design designation (the
 * kind of string that shows up in a CSV's free-text `Model` column — a
 * Transport Canada/FAA type-certificate model number, not the marketing
 * name pilots actually think in) to the aircraft it really is. Surfaced as
 * a suggestion when resolving an unrecognized CSV tail, never applied
 * silently — same principle as ForeFlight's `EquipmentType` instance-type
 * hint (see csv-foreflight.ts).
 */
export type AircraftModelAlias = {
  /** Matched case-insensitively as a substring of the CSV's free-text model
   * column (e.g. a ForeFlight Aircraft Table row's "Make Model" text). */
  match: string;
  manufacturerName: string;
  model: string;
  commonName: string;
  /** ICAO aircraft type designator (Doc 8643) — the actual identity key:
   * `findOrCreateModel` looks up an existing catalog row by this first,
   * across every manufacturer, before falling back to manufacturer+model.
   * That's what makes the manufacturer name below just a reasonable
   * default rather than something that has to be right — a type
   * certificate can outlive the company that held it (Canadair was
   * absorbed into Bombardier, which sold the CRJ program to Mitsubishi;
   * "Canadair CL-600-2D24" and "Bombardier CL-600-2D24" in two different
   * pilots' exports are the same airframe and resolve to the same row). */
  icao: string;
  categoryClass: CategoryClass;
  highPerformance: boolean;
  tailwheel: boolean;
  /** '' for an engineless model — none of the seeds below need that. */
  engineType: EngineType | '';
  flaps: boolean;
  controllablePitchProp: boolean;
  retractableGear: boolean;
};

// Shared equipment/identity fields for one CRJ variant, independent of which
// raw CSV text (`match`) leads to it — factored out because each variant
// below now has more than one known `match` string pointing at the exact
// same target (see the comment above `AIRCRAFT_MODEL_ALIASES`).
type CrjVariant = Omit<AircraftModelAlias, 'match'>;

const CRJ_200: CrjVariant = {
  manufacturerName: 'Bombardier',
  model: 'CL-600-2B19',
  commonName: 'CRJ 200',
  icao: 'CRJ2',
  categoryClass: 'airplane_multi_engine_land',
  highPerformance: true,
  tailwheel: false,
  engineType: 'jet',
  flaps: true,
  controllablePitchProp: false,
  retractableGear: true,
};

const CRJ_700: CrjVariant = {
  manufacturerName: 'Bombardier',
  model: 'CL-600-2C10',
  commonName: 'CRJ 700',
  icao: 'CRJ7',
  categoryClass: 'airplane_multi_engine_land',
  highPerformance: true,
  tailwheel: false,
  engineType: 'jet',
  flaps: true,
  controllablePitchProp: false,
  retractableGear: true,
};

const CRJ_900: CrjVariant = {
  manufacturerName: 'Bombardier',
  model: 'CL-600-2D24',
  commonName: 'CRJ 900',
  icao: 'CRJ9',
  categoryClass: 'airplane_multi_engine_land',
  highPerformance: true,
  tailwheel: false,
  engineType: 'jet',
  flaps: true,
  controllablePitchProp: false,
  retractableGear: true,
};

/**
 * Hand-curated, so far just the Bombardier CRJ family's Transport Canada
 * type-design model numbers (Type Certificate Data Sheet A-21) — every CRJ
 * tail in a logbook export tends to carry one of these instead of the
 * marketing name, and a pilot who's flown the type for a career can have
 * hundreds of tails all needing the same translation. `controllable_pitch_prop`
 * is false for all of them (turbofans, not propellers), which is also why
 * none of them come out complex regardless of `retractable_gear` — see
 * `isComplexAircraft` and seed_aircraft.go's identical reasoning for
 * transport-category jets.
 *
 * Two entries per variant: the opaque type-design designator (what most
 * exports carry), and the marketing name itself (`CRJ 200`/`CRJ 700`/
 * `CRJ 900`) — some fleets' `Model` column already holds the marketing name
 * instead of the type-design code, which is exactly the text `findAircraftModelAlias`
 * exists to translate, so it needs the same suggestion either way. Both
 * entries for a variant carry the *same* icao, which is what makes them
 * resolve to one catalog row regardless of which raw text a given tail's
 * export happened to use — see `findOrCreateModel`'s icao-first lookup.
 */
const AIRCRAFT_MODEL_ALIASES: ReadonlyArray<AircraftModelAlias> = [
  { match: 'CL-600-2B19', ...CRJ_200 },
  { match: 'CRJ 200', ...CRJ_200 },
  { match: 'CL-600-2C10', ...CRJ_700 },
  { match: 'CRJ 700', ...CRJ_700 },
  { match: 'CL-600-2D24', ...CRJ_900 },
  { match: 'CRJ 900', ...CRJ_900 },
];

/**
 * Looks up a known alias for a CSV's free-text model column, or `null` if
 * nothing matches — the common case, since most CSV model text is already
 * a plain make/model a pilot would recognize.
 */
export function findAircraftModelAlias(modelText: string): AircraftModelAlias | null {
  const normalized = modelText.trim().toUpperCase();
  if (!normalized) return null;
  for (const alias of AIRCRAFT_MODEL_ALIASES) {
    if (normalized.includes(alias.match.toUpperCase())) return alias;
  }
  return null;
}
