import { describe, expect, it } from 'vitest';
import { airportFromRecord, nauticalMilesBetween } from './airports.js';

describe('airportFromRecord', () => {
  it('collapses PocketBase empty strings to null for text fields', () => {
    const airport = airportFromRecord({
      ident: '00AK',
      icao: '',
      iata: '',
      type: 'small_airport',
      name: 'Lowell Field',
      municipality: '',
      country: 'US',
      region: 'US-AK',
      lat: 59.949,
      lon: -151.696,
      elevation_ft: 450,
    });
    expect(airport.icao).toBeNull();
    expect(airport.iata).toBeNull();
    expect(airport.municipality).toBeNull();
    expect(airport.country).toBe('US');
  });

  it('keeps a real value untouched', () => {
    const airport = airportFromRecord({
      ident: 'KJFK',
      icao: 'KJFK',
      iata: 'JFK',
      type: 'large_airport',
      name: 'John F Kennedy International Airport',
      municipality: 'New York',
      country: 'US',
      region: 'US-NY',
      lat: 40.639447,
      lon: -73.779317,
      elevation_ft: 13,
    });
    expect(airport.icao).toBe('KJFK');
    expect(airport.lat).toBe(40.639447);
    expect(airport.elevationFt).toBe(13);
  });

  it('defaults missing numeric fields to 0, matching the PocketBase contract', () => {
    const airport = airportFromRecord({
      ident: '00CA',
      type: 'heliport',
      name: 'Goodyear Air Base Heliport',
    });
    expect(airport.lat).toBe(0);
    expect(airport.lon).toBe(0);
    expect(airport.elevationFt).toBe(0);
  });
});

describe('nauticalMilesBetween', () => {
  it('is zero for the same point', () => {
    expect(nauticalMilesBetween({ lat: 37.46, lon: -122.11 }, { lat: 37.46, lon: -122.11 })).toBe(0);
  });

  it('is ~60nm for one degree of latitude — a nautical mile is defined as one minute of arc', () => {
    const distance = nauticalMilesBetween({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    expect(distance).toBeCloseTo(60.04, 1);
  });

  it('is ~60nm for one degree of longitude at the equator', () => {
    const distance = nauticalMilesBetween({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    expect(distance).toBeCloseTo(60.04, 1);
  });

  it('is symmetric', () => {
    const a = { lat: 37.461, lon: -122.115 };
    const b = { lat: 34.052, lon: -118.244 };
    expect(nauticalMilesBetween(a, b)).toBeCloseTo(nauticalMilesBetween(b, a), 6);
  });

  it('matches a known city pair within a few nm — KJFK to KLAX is ~2145nm', () => {
    const jfk = { lat: 40.639447, lon: -73.779317 };
    const lax = { lat: 33.9425, lon: -118.408056 };
    expect(nauticalMilesBetween(jfk, lax)).toBeCloseTo(2145, -1);
  });
});
