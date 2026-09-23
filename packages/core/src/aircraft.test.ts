import { describe, expect, it } from 'vitest';
import {
  aircraftTypeDriftFields,
  anonymousTailNumberForModel,
  displayTailNumber,
  hasAircraftTypeDrift,
  isAircraftInstanceType,
  isAnonymousTail,
  isCategoryClass,
  isComplexAircraft,
  isEngineType,
  isMinimumAvionics,
  resolveAircraftType,
} from './aircraft.js';

import type { AircraftTypeInfo } from './aircraft.js';

describe('isCategoryClass', () => {
  it('accepts a known category/class value', () => {
    expect(isCategoryClass('airplane_single_engine_land')).toBe(true);
  });

  it('rejects an unknown value', () => {
    expect(isCategoryClass('spaceship')).toBe(false);
  });
});

describe('isAircraftInstanceType', () => {
  it('accepts every known instance type', () => {
    expect(isAircraftInstanceType('real')).toBe(true);
    expect(isAircraftInstanceType('uncertified_sim')).toBe(true);
    expect(isAircraftInstanceType('certified_ifr_sim')).toBe(true);
    expect(isAircraftInstanceType('certified_ifr_landings_sim')).toBe(true);
    expect(isAircraftInstanceType('certified_atd')).toBe(true);
  });

  it('rejects an unknown value', () => {
    expect(isAircraftInstanceType('drone')).toBe(false);
  });
});

describe('isMinimumAvionics', () => {
  it('accepts every known avionics tier', () => {
    expect(isMinimumAvionics('non_glass')).toBe(true);
    expect(isMinimumAvionics('glass_pfd')).toBe(true);
    expect(isMinimumAvionics('glass_panel_taa')).toBe(true);
  });

  it('rejects an unknown value', () => {
    expect(isMinimumAvionics('steam_gauges')).toBe(false);
  });
});

describe('isEngineType', () => {
  it('accepts every known engine type', () => {
    expect(isEngineType('piston')).toBe(true);
    expect(isEngineType('turboprop')).toBe(true);
    expect(isEngineType('jet')).toBe(true);
    expect(isEngineType('turbine_other')).toBe(true);
    expect(isEngineType('electric')).toBe(true);
  });

  it('rejects an unknown value', () => {
    expect(isEngineType('rubber_band')).toBe(false);
  });
});

describe('isComplexAircraft', () => {
  const base = {
    categoryClass: 'airplane_single_engine_land' as const,
    flaps: true,
    controllablePitchProp: true,
    retractableGear: true,
  };

  it('is complex with flaps, a controllable pitch prop, and retractable gear', () => {
    expect(isComplexAircraft(base)).toBe(true);
  });

  it('is not complex without flaps', () => {
    expect(isComplexAircraft({ ...base, flaps: false })).toBe(false);
  });

  it('is not complex without a controllable pitch prop', () => {
    expect(isComplexAircraft({ ...base, controllablePitchProp: false })).toBe(false);
  });

  it('is not complex without retractable gear', () => {
    expect(isComplexAircraft({ ...base, retractableGear: false })).toBe(false);
  });

  it('exempts seaplanes from the retractable gear requirement', () => {
    expect(
      isComplexAircraft({ ...base, categoryClass: 'airplane_single_engine_sea', retractableGear: false }),
    ).toBe(true);
    expect(
      isComplexAircraft({ ...base, categoryClass: 'airplane_multi_engine_sea', retractableGear: false }),
    ).toBe(true);
  });

  it('still requires flaps and a controllable pitch prop for seaplanes', () => {
    expect(
      isComplexAircraft({
        ...base,
        categoryClass: 'airplane_single_engine_sea',
        retractableGear: false,
        flaps: false,
      }),
    ).toBe(false);
  });
});

describe('anonymousTailNumberForModel', () => {
  it('synthesizes a tail number from the model id', () => {
    expect(anonymousTailNumberForModel('abc123')).toBe('#abc123');
  });
});

describe('isAnonymousTail', () => {
  it('recognizes a synthesized anonymous tail', () => {
    expect(isAnonymousTail('#abc123')).toBe(true);
  });

  it('does not flag a real tail number', () => {
    expect(isAnonymousTail('N4573D')).toBe(false);
  });
});

describe('displayTailNumber', () => {
  it('shows a real tail number as-is', () => {
    expect(displayTailNumber('N4573D', 'Cessna 172')).toBe('N4573D');
  });

  it('shows an anonymous tail as "Anonymous <model description>"', () => {
    expect(displayTailNumber('#abc123', 'Cessna 172')).toBe('Anonymous Cessna 172');
  });
});

describe('resolveAircraftType', () => {
  const live: AircraftTypeInfo = {
    description: 'CRJ550',
    categoryClass: 'airplane_multi_engine_land',
    complex: true,
    highPerformance: true,
    tailwheel: false,
    engineType: 'jet',
  };

  it('prefers a flight snapshot over live data, e.g. after a tail is reclassified (issue #71)', () => {
    const snapshot = {
      logged_aircraft_type: 'CRJ700',
      logged_category_class: 'airplane_multi_engine_land',
      logged_complex: true,
      logged_high_performance: true,
      logged_tailwheel: false,
      logged_engine_type: 'jet',
    };
    expect(resolveAircraftType(snapshot, live)).toEqual({
      description: 'CRJ700',
      categoryClass: 'airplane_multi_engine_land',
      complex: true,
      highPerformance: true,
      tailwheel: false,
      engineType: 'jet',
    });
  });

  it('falls back to live data when the flight has no snapshot yet (pre-migration rows)', () => {
    expect(resolveAircraftType(null, live)).toBe(live);
    expect(resolveAircraftType({}, live)).toBe(live);
    expect(resolveAircraftType({ logged_category_class: '' }, live)).toBe(live);
  });

  it('falls back to live data when the snapshot category/class is unrecognized', () => {
    expect(resolveAircraftType({ logged_category_class: 'spaceship' }, live)).toBe(live);
  });

  it('returns null when there is neither a snapshot nor live data', () => {
    expect(resolveAircraftType(null, null)).toBeNull();
  });

  it('treats an unrecognized snapshot engine type as unset', () => {
    const snapshot = {
      logged_category_class: 'glider',
      logged_engine_type: 'rubber_band',
    };
    expect(resolveAircraftType(snapshot, live)?.engineType).toBe('');
  });
});

describe('aircraftTypeDriftFields / hasAircraftTypeDrift', () => {
  const live: AircraftTypeInfo = {
    description: 'CRJ550',
    categoryClass: 'airplane_multi_engine_land',
    complex: true,
    highPerformance: true,
    tailwheel: false,
    engineType: 'jet',
  };
  const matching = {
    logged_aircraft_type: 'CRJ550',
    logged_category_class: 'airplane_multi_engine_land',
    logged_complex: true,
    logged_high_performance: true,
    logged_tailwheel: false,
    logged_engine_type: 'jet',
  };

  it('reports no drift when the snapshot matches current live data', () => {
    expect(aircraftTypeDriftFields(matching, live)).toEqual([]);
    expect(hasAircraftTypeDrift(matching, live)).toBe(false);
  });

  it('reports each field that disagrees after a model correction (issue #71)', () => {
    const snapshot = { ...matching, logged_aircraft_type: 'CRJ700', logged_complex: false };
    expect(aircraftTypeDriftFields(snapshot, live)).toEqual(['description', 'complex']);
    expect(hasAircraftTypeDrift(snapshot, live)).toBe(true);
  });

  it('detects a category/class change', () => {
    const snapshot = { ...matching, logged_category_class: 'airplane_single_engine_land' };
    expect(aircraftTypeDriftFields(snapshot, live)).toEqual(['categoryClass']);
  });

  it('treats a flight with no snapshot yet as in sync, since it already reads live data', () => {
    expect(hasAircraftTypeDrift(null, live)).toBe(false);
    expect(hasAircraftTypeDrift({}, live)).toBe(false);
    expect(hasAircraftTypeDrift({ logged_category_class: 'spaceship' }, live)).toBe(false);
  });

  it('reports no drift when there is no resolvable live model to sync to', () => {
    expect(hasAircraftTypeDrift(matching, null)).toBe(false);
  });

  it('compares an unrecognized snapshot engine type as unset', () => {
    const glider: AircraftTypeInfo = { ...live, categoryClass: 'glider', engineType: '' };
    const snapshot = { ...matching, logged_category_class: 'glider', logged_engine_type: 'rubber_band' };
    expect(hasAircraftTypeDrift(snapshot, glider)).toBe(false);
  });
});
