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

  it('returns null for unrecognized model text', () => {
    expect(findAircraftModelAlias('Cessna 172S')).toBeNull();
  });

  it('returns null for blank model text', () => {
    expect(findAircraftModelAlias('')).toBeNull();
  });
});
