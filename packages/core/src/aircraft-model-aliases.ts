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
 */
const AIRCRAFT_MODEL_ALIASES: ReadonlyArray<AircraftModelAlias> = [
  {
    match: 'CL-600-2B19',
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
  },
  {
    match: 'CL-600-2C10',
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
  },
  {
    match: 'CL-600-2D24',
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
  },
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
