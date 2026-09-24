/**
 * A candidate row from the `aircraft_models` catalog, reduced to the fields
 * `findConfidentModelMatch` compares against a CSV's free-text model column.
 */
export type ModelMatchCandidate = {
  id: string;
  manufacturerName: string;
  model: string;
  commonName: string;
  /** FAA/Transport Canada Type Certificate Data Sheet model number (e.g.
   * "CL-600-2B19"), or '' if not recorded — see
   * aircraft_models.type_design_designator. */
  typeDesignDesignator: string;
  /** ICAO aircraft type designator (Doc 8643), or '' if unknown. */
  icao: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * A *confident* match between a CSV row's free-text model column and an
 * existing `aircraft_models` catalog row — strict equality of normalized
 * text against one of the candidate's own identifiers (common name, "make
 * model", bare model code, or ICAO designator), not the loose
 * substring-either-way comparison `modelTextMatches` uses to flag a
 * mismatch worth a second look. That looseness is fine for a warning a
 * pilot reviews; it is not fine for silently deciding what aircraft a
 * flight was flown in.
 *
 * Returns `null` when nothing matches, or when more than one distinct
 * catalog row would claim the same normalized text (e.g. two manufacturers
 * both have a model literally called "Skyhawk") — ambiguity means this
 * still needs a human, same as an unrecognized model.
 *
 * This only ever resolves to a model *already in the catalog*. It never
 * invents one — see `findAircraftModelAlias` for the (also
 * never-auto-applied) opaque-type-code translation case, and CLAUDE.md's
 * import notes on why a brand-new model is deliberately never
 * auto-created from CSV text.
 */
export function findConfidentModelMatch<T extends ModelMatchCandidate>(
  csvModelText: string,
  candidates: ReadonlyArray<T>,
): T | null {
  const target = normalize(csvModelText);
  if (!target) return null;

  let match: T | null = null;
  for (const candidate of candidates) {
    const keys = [
      candidate.commonName,
      candidate.model,
      `${candidate.manufacturerName} ${candidate.model}`,
      candidate.typeDesignDesignator,
      `${candidate.manufacturerName} ${candidate.typeDesignDesignator}`,
      candidate.icao,
    ]
      .map(normalize)
      .filter(Boolean);

    if (!keys.includes(target)) continue;
    if (match && match.id !== candidate.id) return null;
    match = candidate;
  }
  return match;
}
