import { describe, expect, it } from 'vitest';

import { findAircraftModelAlias } from './aircraft-model-aliases.js';

describe('findAircraftModelAlias', () => {
  it('recognizes the CRJ 200 type-design designation', () => {
    const alias = findAircraftModelAlias('Bombardier CL-600-2B19');
    expect(alias?.commonName).toBe('CRJ 200');
    expect(alias?.manufacturerName).toBe('Bombardier');
    expect(alias?.icao).toBe('CRJ2');
  });

  it('recognizes the CRJ 700 type-design designation', () => {
    const alias = findAircraftModelAlias('Bombardier CL-600-2C10');
    expect(alias?.commonName).toBe('CRJ 700');
    expect(alias?.icao).toBe('CRJ7');
  });

  it('recognizes the CRJ 900 type-design designation', () => {
    const alias = findAircraftModelAlias('Bombardier CL-600-2D24');
    expect(alias?.commonName).toBe('CRJ 900');
    expect(alias?.icao).toBe('CRJ9');
  });

  it('matches the bare model code without a manufacturer prefix', () => {
    expect(findAircraftModelAlias('CL-600-2C10')?.commonName).toBe('CRJ 700');
  });

  it('matches regardless of which historical manufacturer name the CSV used', () => {
    // Canadair was absorbed into Bombardier — the same type certificate
    // shows up under either name depending on export vintage.
    expect(findAircraftModelAlias('Canadair CL-600-2D24')?.icao).toBe('CRJ9');
    expect(findAircraftModelAlias('Bombardier CL-600-2D24')?.icao).toBe('CRJ9');
  });

  it('is case-insensitive', () => {
    expect(findAircraftModelAlias('bombardier cl-600-2c10')?.commonName).toBe('CRJ 700');
  });

  it('returns non-complex equipment fields, since these are turbofans not propellers', () => {
    const alias = findAircraftModelAlias('CL-600-2C10');
    expect(alias?.controllablePitchProp).toBe(false);
    expect(alias?.engineType).toBe('jet');
  });

  it('recognizes the marketing name when a fleet export uses it instead of the type-design designator', () => {
    // Seen in the wild: a ForeFlight Aircraft Table row whose Model column
    // is "CRJ 200"/"CRJ 900" outright rather than the CL-600-2* code most
    // exports carry (see csv-foreflight.ts's Make+Model concatenation).
    const crj200 = findAircraftModelAlias('Bombardier CRJ 200');
    expect(crj200?.icao).toBe('CRJ2');
    expect(crj200?.model).toBe('CL-600-2B19');

    const crj900 = findAircraftModelAlias('Bombardier CRJ 900');
    expect(crj900?.icao).toBe('CRJ9');
    expect(crj900?.model).toBe('CL-600-2D24');
  });

  it('resolves the type-design designator and the marketing name to the same identity', () => {
    // The whole point: whichever raw text a pilot's export happens to use
    // for a given tail, resolving it points at the same icao (and so the
    // same catalog row via findOrCreateModel's icao-first lookup) rather
    // than a second, differently-worded row for the same real aircraft.
    const byDesignator = findAircraftModelAlias('Bombardier CL-600-2D24');
    const byMarketingName = findAircraftModelAlias('Bombardier CRJ 900');
    expect(byMarketingName?.icao).toBe(byDesignator?.icao);
    expect(byMarketingName?.model).toBe(byDesignator?.model);
    expect(byMarketingName?.commonName).toBe(byDesignator?.commonName);
  });

  it('returns null for unrecognized model text', () => {
    expect(findAircraftModelAlias('Cessna 172S')).toBeNull();
  });

  it('returns null for blank model text', () => {
    expect(findAircraftModelAlias('')).toBeNull();
  });
});
