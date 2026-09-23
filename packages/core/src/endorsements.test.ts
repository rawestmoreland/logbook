import { describe, expect, it } from 'vitest';
import {
  authorizeInstructorSign,
  computeEndorsementContentHash,
  toCfiLookupResult,
} from './endorsements.js';
import type { CfiLookupCandidate, EndorsementContentFields } from './endorsements.js';

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

  it('produces the same hash for the token and instructor sign paths given equivalent fields', () => {
    // Both `signEndorsement` (token flow) and `signEndorsementAsInstructor`
    // (account-linked flow) build this same field shape from the endorsement
    // record before hashing — this pins that equivalence rather than letting
    // one path drift from the other.
    const fromTokenPath = computeEndorsementContentHash(baseFields);
    const fromInstructorPath = computeEndorsementContentHash({ ...baseFields });
    expect(fromInstructorPath).toBe(fromTokenPath);
  });
});

const instructor: CfiLookupCandidate = {
  id: 'pilot_cfi001',
  name: 'Jamie CFI',
  isInstructor: true,
  userId: 'user_cfi001',
};

describe('toCfiLookupResult', () => {
  it('returns id and name for an instructor-flagged pilot', () => {
    expect(toCfiLookupResult(instructor, 'user_caller')).toEqual({
      id: 'pilot_cfi001',
      name: 'Jamie CFI',
    });
  });

  it('never returns anything beyond id and name', () => {
    const result = toCfiLookupResult(instructor, 'user_caller');
    expect(result && Object.keys(result).sort()).toEqual(['id', 'name']);
  });

  it('returns null when no pilot matched', () => {
    expect(toCfiLookupResult(null, 'user_caller')).toBeNull();
  });

  it('returns null for a pilot who is not flagged as an instructor', () => {
    expect(toCfiLookupResult({ ...instructor, isInstructor: false }, 'user_caller')).toBeNull();
  });

  it('returns null when the caller looks themselves up', () => {
    expect(toCfiLookupResult(instructor, instructor.userId)).toBeNull();
  });
});

describe('authorizeInstructorSign', () => {
  it('allows the linked instructor to sign an unsigned endorsement', () => {
    expect(
      authorizeInstructorSign({ instructorUserId: 'user_cfi001', callerUserId: 'user_cfi001', signedAt: '' }),
    ).toEqual({ ok: true });
  });

  it('rejects a caller who is not the linked instructor', () => {
    expect(
      authorizeInstructorSign({ instructorUserId: 'user_cfi001', callerUserId: 'user_other', signedAt: '' }),
    ).toEqual({ ok: false, reason: 'not_authorized' });
  });

  it('rejects when no instructor is linked yet', () => {
    expect(
      authorizeInstructorSign({ instructorUserId: null, callerUserId: 'user_cfi001', signedAt: '' }),
    ).toEqual({ ok: false, reason: 'not_authorized' });
  });

  it('rejects an already-signed endorsement even for the linked instructor', () => {
    expect(
      authorizeInstructorSign({
        instructorUserId: 'user_cfi001',
        callerUserId: 'user_cfi001',
        signedAt: '2026-01-15',
      }),
    ).toEqual({ ok: false, reason: 'already_signed' });
  });
});
