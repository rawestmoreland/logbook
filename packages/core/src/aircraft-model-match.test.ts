import { describe, expect, it } from 'vitest';

import { findConfidentModelMatch, type ModelMatchCandidate } from './aircraft-model-match.js';

const c172s: ModelMatchCandidate = {
  id: 'c172s',
  manufacturerName: 'Cessna',
  model: '172S',
  commonName: 'Skyhawk',
  typeDesignDesignator: '',
  icao: 'C172',
};

const warrior: ModelMatchCandidate = {
  id: 'warrior',
  manufacturerName: 'Piper',
  model: 'PA-28-161',
  commonName: 'Warrior',
  typeDesignDesignator: '',
  icao: 'P28A',
};

const crj200: ModelMatchCandidate = {
  id: 'crj200',
  manufacturerName: 'Bombardier',
  model: 'CL-600-2B19',
  commonName: 'CRJ 200',
  typeDesignDesignator: 'CL-600-2B19',
  icao: 'CRJ2',
};

const catalog = [c172s, warrior];

describe('findConfidentModelMatch', () => {
  it('matches on the common name, case- and punctuation-insensitively', () => {
    expect(findConfidentModelMatch('skyhawk', catalog)).toBe(c172s);
    expect(findConfidentModelMatch('SKY-HAWK', catalog)).toBe(c172s);
  });

  it('matches on the bare model code', () => {
    expect(findConfidentModelMatch('172S', catalog)).toBe(c172s);
  });

  it('matches on "manufacturer model"', () => {
    expect(findConfidentModelMatch('Cessna 172S', catalog)).toBe(c172s);
  });

  it('matches on the ICAO designator', () => {
    expect(findConfidentModelMatch('P28A', catalog)).toBe(warrior);
  });

  it('matches on the type-design designator even when it differs from model/commonName', () => {
    // model/commonName already equal "CL-600-2B19" here, so exercise the
    // case where a candidate's model text has since moved to the marketing
    // name (see aircraft-model-aliases.ts) and only typeDesignDesignator
    // still carries the FAA/TC number a CSV's raw text might use.
    const withDivergedModel: ModelMatchCandidate = { ...crj200, model: 'CRJ 200' };
    expect(findConfidentModelMatch('CL-600-2B19', [withDivergedModel])).toBe(withDivergedModel);
  });

  it('does not match a loose substring — unlike modelTextMatches', () => {
    // "172" alone isn't any candidate's full normalized identifier.
    expect(findConfidentModelMatch('172', catalog)).toBeNull();
  });

  it('returns null for text with no match', () => {
    expect(findConfidentModelMatch('Robinson R44', catalog)).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(findConfidentModelMatch('', catalog)).toBeNull();
  });

  it('returns null when two distinct rows claim the same normalized text', () => {
    const duplicate: ModelMatchCandidate = { ...warrior, id: 'warrior-2' };
    expect(findConfidentModelMatch('Warrior', [warrior, duplicate])).toBeNull();
  });

  it('is not ambiguous when the same row matches on more than one key', () => {
    // "Cessna Skyhawk" hits both the "manufacturer model" key (no) and
    // common name path indirectly via manufacturer+model combos — make sure
    // matching twice on the *same* candidate id doesn't get flagged as
    // ambiguous.
    expect(findConfidentModelMatch('Skyhawk', [c172s, c172s])).toBe(c172s);
  });
});
