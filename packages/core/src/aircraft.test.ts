import { describe, expect, it } from 'vitest';
import {
  anonymousTailNumberForModel,
  displayTailNumber,
  isAircraftInstanceType,
  isAnonymousTail,
  isCategoryClass,
  isEngineType,
  isMinimumAvionics,
} from './aircraft.js';

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
