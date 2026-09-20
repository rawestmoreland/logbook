import { describe, expect, it } from 'vitest';
import { computeEndorsementContentHash } from './endorsements.js';
import type { EndorsementContentFields } from './endorsements.js';

const baseFields: EndorsementContentFields = {
  type: 'flight_review',
  date: '2026-01-15',
  text: 'I certify that N12345 has satisfactorily completed a flight review.',
  flightId: 'flight_abc123',
  pilotId: 'pilot_xyz789',
};

describe('computeEndorsementContentHash', () => {
  it('is deterministic for identical input', () => {
    expect(computeEndorsementContentHash(baseFields)).toBe(
      computeEndorsementContentHash({ ...baseFields }),
    );
  });

  it('changes when type changes', () => {
    expect(computeEndorsementContentHash(baseFields)).not.toBe(
      computeEndorsementContentHash({ ...baseFields, type: 'checkride' }),
    );
  });

  it('changes when date changes', () => {
    expect(computeEndorsementContentHash(baseFields)).not.toBe(
      computeEndorsementContentHash({ ...baseFields, date: '2026-02-15' }),
    );
  });

  it('changes when text changes', () => {
    expect(computeEndorsementContentHash(baseFields)).not.toBe(
      computeEndorsementContentHash({ ...baseFields, text: 'Different text.' }),
    );
  });

  it('changes when flightId changes', () => {
    expect(computeEndorsementContentHash(baseFields)).not.toBe(
      computeEndorsementContentHash({ ...baseFields, flightId: 'flight_other' }),
    );
  });

  it('changes when pilotId changes', () => {
    expect(computeEndorsementContentHash(baseFields)).not.toBe(
      computeEndorsementContentHash({ ...baseFields, pilotId: 'pilot_other' }),
    );
  });

  it('is not trivially foolable by concatenation shifts across fields', () => {
    const a = computeEndorsementContentHash({
      ...baseFields,
      text: 'ab',
      flightId: 'c',
    });
    const b = computeEndorsementContentHash({
      ...baseFields,
      text: 'a',
      flightId: 'bc',
    });
    expect(a).not.toBe(b);
  });
});
